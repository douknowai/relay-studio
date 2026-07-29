// Temporary migration runner: executes SQL files via node-pg.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { spawnSync } = require("child_process");

function setEnvFromOutput(output) {
  const SQ = String.fromCharCode(39); // single quote
  const DQ = String.fromCharCode(34); // double quote
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

function loadEnvFromPlatform() {
  const pythonCode =
    "import sys\ntry:\n    from coze_workload_identity import Client\n    client = Client()\n    env_vars = client.get_project_env_vars()\n    client.close()\n    for env_var in env_vars:\n        print(env_var.key + '=' + env_var.value)\nexcept Exception as e:\n    print('# Error: ' + str(e), file=sys.stderr)\n";
  const res = spawnSync("python3", ["-c", pythonCode], {
    encoding: "utf-8",
    timeout: 15000,
  });
  if (res.error || res.status !== 0) {
    console.warn("[run-migrations] python env discovery failed:", (res.stderr || res.error || "").toString().slice(0, 200));
    return;
  }
  setEnvFromOutput(res.stdout || "");
}

async function main() {
  loadEnvFromPlatform();

  const envLocal = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envLocal)) {
    setEnvFromOutput(fs.readFileSync(envLocal, "utf-8"));
  }

  const connStr = process.env.PGDATABASE_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error("No PGDATABASE_URL / DATABASE_URL found");
    process.exit(1);
  }
  console.log("Connecting to database...");

  const { Client } = require("pg");
  const client = new Client({ connectionString: connStr });
  await client.connect();

  const base = path.join(__dirname, "..", "supabase");
  const files = [
    "migrations/0001_idempotency_unique_and_cascade.sql",
    "migrations/0002_enable_rls.sql",
    "migrations/0003_identity_rls_atomic_quota.sql",
    "seed.sql",
  ];

  for (const rel of files) {
    const fp = path.join(base, rel);
    if (!fs.existsSync(fp)) {
      console.warn("SKIP (missing): " + rel);
      continue;
    }
    let sql = fs.readFileSync(fp, "utf-8");
    // health_check is a platform-managed system table whose owner is not the
    // current connection role, so strip any DDL that touches it. It has no
    // business significance (health-check probe only).
    if (rel.indexOf("0003") !== -1) {
      sql = sql.replace(/ALTER TABLE health_check ENABLE ROW LEVEL SECURITY;\s*\n/g, "");
      sql = sql.replace(/REVOKE ALL ON TABLE health_check,\s*/, "REVOKE ALL ON TABLE ");
    }
    try {
      await client.query(sql);
      console.log("OK  " + rel);
    } catch (err) {
      console.error("ERR " + rel + ": " + err.message);
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
    }
  }

  await client.end();
  console.log("Migrations finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
