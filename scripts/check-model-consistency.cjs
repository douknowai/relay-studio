// Capability-consistency guard: detects drift between gate columns and
// capability_metadata JSON in model_configs. Run in CI (or before deploy):
//   node scripts/check-model-consistency.cjs
// Exit code 1 + violation list when drift is detected.
//
// Checks:
//   [1] media_type routing discriminator must not linger in JSON after the
//       entity column exists (0004 migration), and entity column must agree
//       with the JSON value when both are present (pre-migration state).
//   [2] Video models (media_type = video) must expose at least one of
//       supports_text_to_video / supports_image_to_video — otherwise the
//       generation gate rejects every request ("此模型不支持文生视频").
//   [3] Enabled non-mock models must declare a non-empty external_model_id —
//       otherwise the provider silently falls back to a default model.
//   [4] Gate-semantics booleans must not be duplicated in JSON.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function setEnvFromOutput(output) {
  const SQ = String.fromCharCode(39);
  const DQ = String.fromCharCode(34);
  for (const line of output.trim().split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.substring(0, eq).trim();
    let v = line.substring(eq + 1).trim();
    if ((v.startsWith(SQ) && v.endsWith(SQ)) || (v.startsWith(DQ) && v.endsWith(DQ))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function loadEnv() {
  const pythonCode =
    "import sys\ntry:\n    from coze_workload_identity import Client\n    client = Client()\n    env_vars = client.get_project_env_vars()\n    client.close()\n    for env_var in env_vars:\n        print(env_var.key + '=' + env_var.value)\nexcept Exception as e:\n    print('# Error: ' + str(e), file=sys.stderr)\n";
  const res = spawnSync("python3", ["-c", pythonCode], { encoding: "utf-8", timeout: 15000 });
  if (res.status === 0) setEnvFromOutput(res.stdout || "");
  const envLocal = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envLocal)) setEnvFromOutput(fs.readFileSync(envLocal, "utf-8"));
}

async function main() {
  loadEnv();
  const connStr = process.env.PGDATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error("[db:check] No PGDATABASE_URL / DATABASE_URL found");
    process.exit(1);
  }

  let pg;
  try {
    pg = require("pg");
  } catch {
    console.error("[db:check] pg module unavailable — run via `pnpm db:check`");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: connStr });
  await client.connect();

  const { rows } = await client.query("SELECT * FROM model_configs");
  const violations = [];

  const hasColumn = (row, col) => Object.prototype.hasOwnProperty.call(row, col);

  for (const row of rows) {
    const meta = row.capability_metadata || {};
    const code = row.code;

    // Effective media type (entity column > JSON > provider heuristic)
    const mediaType =
      hasColumn(row, "media_type") && row.media_type
        ? row.media_type
        : meta.media_type || (String(row.provider_type || "").includes("video") ? "video" : "image");

    // [1] entity column vs JSON agreement / leftover
    if (hasColumn(row, "media_type") && meta.media_type && meta.media_type !== row.media_type) {
      violations.push(`[${code}] media_type 冲突: entity=${row.media_type} json=${meta.media_type}`);
    }
    if (hasColumn(row, "media_type") && meta.media_type && row.media_type === meta.media_type) {
      violations.push(`[${code}] media_type 残留在 capability_metadata（已提升为实体列，应从 JSON 删除）`);
    }

    // [2] video models need at least one generation gate
    if (mediaType === "video") {
      const t2v = row.supports_text_to_video === true || meta.supports_text_to_video === true;
      const i2v = row.supports_image_to_video === true || meta.supports_image_to_video === true;
      if (!t2v && !i2v) {
        violations.push(`[${code}] 视频模型 t2v/i2v 能力列全为 false —— 生成请求会被能力门拦截`);
      }
    }

    // [3] external_model_id required for enabled non-mock models
    const extId = String(row.external_model_id || "").trim();
    if (row.enabled === true && row.provider_type !== "mock" && extId === "") {
      violations.push(`[${code}] 启用的非 mock 模型 external_model_id 为空 —— Provider 将静默兜底路由`);
    }

    // [4] gate booleans duplicated in JSON
    for (const f of ["supports_text_to_video", "supports_image_to_video", "supports_multiple_references"]) {
      if (f in meta) {
        violations.push(`[${code}] 判定语义字段 ${f} 残留在 capability_metadata —— 应只存在于实体列`);
      }
    }
  }

  await client.end();

  if (violations.length > 0) {
    console.error(`\n[db:check] 发现 ${violations.length} 处能力数据漂移：\n`);
    for (const v of violations) console.error("  ✗ " + v);
    console.error("\n修复指引：能力判定走实体列（supports_text_to_video 等），");
    console.error("展示参数留在 capability_metadata；参考 supabase/migrations/0004_model_capability_layering.sql\n");
    process.exit(1);
  }

  console.log(`[db:check] ${rows.length} 个模型能力数据一致 ✓`);
}

main().catch((err) => {
  console.error("[db:check] failed:", err.message);
  process.exit(1);
});
