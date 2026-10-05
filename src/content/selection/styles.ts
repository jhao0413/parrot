/** 划词弹窗 shadow root 内注入的样式（自包含，不依赖 Tailwind 产物）。配色与扩展页面一致：zinc 中性色 + 品牌绿，跟随系统深色模式 */
export const popupStyles = `
:host { all: initial; }
.pr-trigger, .pr-popup {
  --pr-bg: #fff;
  --pr-fg: #18181b;
  --pr-text: #3f3f46;
  --pr-muted: #71717a;
  --pr-faint: #71717a;
  --pr-sunken: rgb(244 244 245 / 0.8);
  --pr-hover: #f4f4f5;
  --pr-line: rgb(0 0 0 / 0.06);
  --pr-ring: rgb(0 0 0 / 0.08);
  --pr-brand: #15803d;
  --pr-focus: #16a34a;
  --pr-error: #dc2626;
  --pr-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 32px -4px rgb(0 0 0 / 0.14);
}
@media (prefers-color-scheme: dark) {
  .pr-trigger, .pr-popup {
    --pr-bg: #18181b;
    --pr-fg: #f4f4f5;
    --pr-text: #d4d4d8;
    --pr-muted: #a1a1aa;
    --pr-faint: #a1a1aa;
    --pr-sunken: rgb(255 255 255 / 0.05);
    --pr-hover: rgb(255 255 255 / 0.06);
    --pr-line: rgb(255 255 255 / 0.06);
    --pr-ring: rgb(255 255 255 / 0.12);
    --pr-brand: #4ade80;
    --pr-error: #f87171;
    --pr-shadow: 0 0 0 1px rgb(255 255 255 / 0.1), 0 12px 32px -4px rgb(0 0 0 / 0.5);
  }
}
.pr-trigger {
  display: block;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.16), 0 4px 10px -2px rgb(0 0 0 / 0.2);
  cursor: pointer;
  transition-property: scale, box-shadow;
  transition-duration: 150ms;
}
.pr-trigger img { display: block; }
.pr-trigger:hover { box-shadow: 0 1px 2px rgb(0 0 0 / 0.2), 0 6px 14px -2px rgb(0 0 0 / 0.26); }
.pr-trigger:active { scale: 0.96; }
.pr-trigger:focus-visible, .pr-icon:focus-visible, .pr-para-btn:focus-visible { outline: 2px solid var(--pr-focus); outline-offset: 2px; }

.pr-popup {
  width: 344px;
  max-height: min(480px, calc(100vh - 16px));
  overflow-y: auto;
  overscroll-behavior: contain;
  box-sizing: border-box;
  border-radius: 14px;
  background: var(--pr-bg);
  padding: 12px 14px 10px;
  box-shadow: var(--pr-shadow);
  font: 13px/1.6 -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--pr-text);
  text-align: start;
  text-spacing-trim: trim-start;
  -webkit-font-smoothing: antialiased;
}
.pr-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}
.pr-source {
  flex: 1;
  min-width: 0;
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--pr-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.pr-error { margin: 0; color: var(--pr-error); overflow-wrap: anywhere; }
.pr-loading { display: grid; gap: 8px; padding: 6px 0 4px; }
.pr-loading span {
  height: 10px;
  border-radius: 99px;
  background: var(--pr-sunken);
  animation: pr-pulse 1.4s ease-in-out infinite;
}
.pr-loading span:last-child { width: 60%; }
@keyframes pr-pulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { .pr-loading span, .pr-icon .pr-busy { animation: none; } }
.pr-result {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--pr-fg);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pr-empty { color: var(--pr-faint); }

/* 图标按钮 */
.pr-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 99px;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--pr-muted);
  cursor: pointer;
  transition-property: color, background-color, scale;
  transition-duration: 150ms;
}
.pr-icon:hover { background: var(--pr-hover); color: var(--pr-fg); }
.pr-icon:active { scale: 0.96; }
.pr-icon:disabled { opacity: 0.4; pointer-events: none; }
.pr-icon svg { width: 15px; height: 15px; flex-shrink: 0; }
.pr-icon.pr-sm { height: 22px; min-width: 22px; padding: 0 4px; }
.pr-icon.pr-sm svg { width: 13px; height: 13px; }
.pr-icon .pr-busy { animation: pr-pulse 1s ease-in-out infinite; color: var(--pr-brand); }
.pr-icon.pr-done { color: var(--pr-brand); }
.pr-close { margin: -2px -6px 0 0; }

/* 词典 */
.pr-dict {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  border-radius: 10px;
  background: var(--pr-sunken);
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.65;
}
.pr-dict-head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; }
.pr-word { font-size: 14px; font-weight: 600; color: var(--pr-fg); }
.pr-phon { display: inline-flex; align-items: center; gap: 3px; color: var(--pr-muted); }
.pr-label { color: var(--pr-faint); }
.pr-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.pr-tag {
  border-radius: 5px;
  padding: 0 5px;
  font-size: 11px;
  line-height: 18px;
  color: var(--pr-muted);
  box-shadow: inset 0 0 0 1px var(--pr-ring);
}
.pr-grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; }
.pr-grid dt { color: var(--pr-faint); text-align: end; }
.pr-grid dd { margin: 0; min-width: 0; }
.pr-grid.pr-phrases dt { color: var(--pr-brand); text-align: start; }
.pr-list { margin: 0; padding: 0; list-style: none; }
.pr-def-list { margin: 0; padding-inline-start: 18px; }
.pr-def-list li::marker { color: var(--pr-faint); }
.pr-example { color: var(--pr-faint); }
.pr-sep { border-top: 1px solid var(--pr-line); padding-top: 8px; }
.pr-forms { display: flex; flex-wrap: wrap; gap: 0 12px; }
.pr-em { color: var(--pr-brand); }
.pr-caption { font-size: 11px; color: var(--pr-faint); margin-bottom: 2px; }

.pr-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 8px -6px 0;
}
.pr-para-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  border: none;
  border-radius: 8px;
  background: var(--pr-sunken);
  padding: 6px 0;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--pr-text);
  cursor: pointer;
  transition-property: background-color, scale;
  transition-duration: 150ms;
}
.pr-para-btn:hover { background: var(--pr-hover); color: var(--pr-fg); }
.pr-para-btn:active { scale: 0.96; }
`;
