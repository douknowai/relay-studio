'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * 控制台风格公共组件
 * 与 /admin/settings（DESIGN.md 设置页控制台 Tokens）保持一致：
 * 页面背景 #F5F5F5、白色容器、行分隔、24px 页标题、16px 分区标题
 */

export const CONSOLE_TOKENS = {
  pageBg: '#F5F5F5',
  containerBg: '#FFFFFF',
  border: 'rgba(26,26,26,0.08)',
  rowBorder: 'rgba(26,26,26,0.06)',
  inputBorder: 'rgba(26,26,26,0.14)',
  textPrimary: '#1A1A1A',
  textSecondary: 'rgba(26,26,26,0.58)',
  accent: '#006699',
  danger: '#B42318',
  swatchOff: 'rgba(26,26,26,0.16)',
} as const;

export const consoleInputStyle: CSSProperties = {
  height: 36,
  borderRadius: 8,
  border: `1px solid ${CONSOLE_TOKENS.inputBorder}`,
  fontSize: 13,
  color: CONSOLE_TOKENS.textPrimary,
  background: '#FFFFFF',
  outline: 'none',
};

export const consoleSelectStyle: CSSProperties = {
  height: 36,
  borderRadius: 8,
  border: `1px solid ${CONSOLE_TOKENS.inputBorder}`,
  fontSize: 13,
  color: CONSOLE_TOKENS.textPrimary,
  background: '#FFFFFF',
  outline: 'none',
  padding: '0 8px',
};

export const consoleTextareaStyle: CSSProperties = {
  borderRadius: 8,
  border: `1px solid ${CONSOLE_TOKENS.inputBorder}`,
  fontSize: 13,
  color: CONSOLE_TOKENS.textPrimary,
  background: '#FFFFFF',
  outline: 'none',
  padding: '8px 10px',
  resize: 'vertical',
};

/** 页面壳：#F5F5F5 背景 + 居中容器 + 24px 标题 */
export function ConsolePage({
  title,
  description,
  actions,
  children,
  maxWidth = 960,
  paddingBottom,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  paddingBottom?: number;
}) {
  return (
    <div
      style={{
        background: CONSOLE_TOKENS.pageBg,
        minHeight: '100%',
        paddingBottom,
      }}
    >
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 24,
                lineHeight: '32px',
                fontWeight: 650,
                color: CONSOLE_TOKENS.textPrimary,
                margin: 0,
              }}
            >
              {title}
            </h1>
            {description ? (
              <p
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  lineHeight: '18px',
                  color: CONSOLE_TOKENS.textSecondary,
                  marginBottom: 0,
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** 分区：16px 标题 + 白色圆角容器 */
export function ConsoleSection({
  title,
  description,
  actions,
  action,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const sectionActions = actions ?? action;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {title ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 16,
                lineHeight: '24px',
                fontWeight: 600,
                color: CONSOLE_TOKENS.textPrimary,
                margin: 0,
              }}
            >
              {title}
            </h2>
            {description ? (
              <p
                style={{
                  marginTop: 2,
                  fontSize: 13,
                  lineHeight: '18px',
                  color: CONSOLE_TOKENS.textSecondary,
                  marginBottom: 0,
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          {sectionActions ? <div style={{ flexShrink: 0 }}>{sectionActions}</div> : null}
        </div>
      ) : null}
      <div
        style={{
          background: CONSOLE_TOKENS.containerBg,
          border: `1px solid ${CONSOLE_TOKENS.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </section>
  );
}

/** 行：14px 20px 内边距 + 底部分隔线（容器内最后一行由列表自行去除）
 *  meta 存在时按「左：标题+描述 / 右：控件」的标准设置行排版 */
export function ConsoleRow({
  children,
  style,
  meta,
  label,
  isLast,
}: {
  children: ReactNode;
  style?: CSSProperties;
  meta?: { label: string; description?: string };
  label?: string;
  isLast?: boolean;
}) {
  const resolvedMeta = meta ?? (label ? { label } : undefined);
  return (
    <div
      style={{
        padding: '14px 20px',
        borderBottom: isLast
          ? 'none'
          : `1px solid ${CONSOLE_TOKENS.rowBorder}`,
        ...(resolvedMeta
          ? {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap' as const,
            }
          : null),
        ...style,
      }}
    >
      {resolvedMeta ? (
        <ConsoleItemMeta
          title={resolvedMeta.label}
          description={resolvedMeta.description}
        />
      ) : null}
      {children}
    </div>
  );
}

/** 设置项标题 + 描述的标准排版 */
export function ConsoleItemMeta({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 14,
          lineHeight: '20px',
          fontWeight: 600,
          color: CONSOLE_TOKENS.textPrimary,
        }}
      >
        {title}
      </div>
      {description ? (
        <div
          style={{
            marginTop: 2,
            fontSize: 13,
            lineHeight: '18px',
            color: CONSOLE_TOKENS.textSecondary,
          }}
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}

/** 控制台风格按钮 */
export const consoleButtonBase: CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: 'none',
  transition: 'opacity 160ms ease-out',
};

export const consolePrimaryButton: CSSProperties = {
  ...consoleButtonBase,
  background: CONSOLE_TOKENS.textPrimary,
  color: '#FFFFFF',
};

export const consoleSecondaryButton: CSSProperties = {
  ...consoleButtonBase,
  background: '#FFFFFF',
  color: CONSOLE_TOKENS.textPrimary,
  border: `1px solid ${CONSOLE_TOKENS.inputBorder}`,
};

export const consoleDangerButton: CSSProperties = {
  ...consoleButtonBase,
  background: '#FFFFFF',
  color: CONSOLE_TOKENS.danger,
  border: '1px solid rgba(180,35,24,0.35)',
};

export const consoleTextActionButton: CSSProperties = {
  ...consoleButtonBase,
  height: 28,
  padding: '0 8px',
  background: 'transparent',
  color: CONSOLE_TOKENS.accent,
  fontWeight: 500,
};
