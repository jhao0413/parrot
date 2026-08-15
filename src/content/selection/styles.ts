/** 划词弹窗 shadow root 内注入的样式（自包含，不依赖 Tailwind 产物） */
export const popupStyles = `
.pr-popup {
  width: 340px;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #1f2937;
}
.pr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.pr-source {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: #9ca3af;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pr-close {
  flex-shrink: 0;
  border: none;
  background: none;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 2px;
}
.pr-close:hover { color: #4b5563; }
.pr-error { margin: 0; font-size: 13px; color: #ef4444; }
.pr-loading { margin: 0; font-size: 13px; color: #9ca3af; }
.pr-result {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #1f2937;
  white-space: pre-wrap;
  flex: 1;
}
.pr-result-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.pr-result-row .pr-icon {
  display: inline-flex;
  align-items: center;
  padding: 2px;
}
.pr-result-row .pr-icon svg {
  width: 15px;
  height: 15px;
}
.pr-icon svg {
  width: 14px;
  height: 14px;
  vertical-align: -2px;
}
.pr-icon .pr-busy {
  animation: pr-pulse 1s ease-in-out infinite;
  color: #3b82f6;
}
@keyframes pr-pulse {
  50% { opacity: 0.4; }
}
.pr-dict {
  border-radius: 8px;
  background: #f9fafb;
  padding: 6px 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.pr-dict-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #374151;
}
.pr-phonetic { font-weight: 400; color: #9ca3af; }
.pr-dict-list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  color: #6b7280;
}
.pr-dict-list li { line-height: 1.5; }
.pr-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.pr-icon {
  border: none;
  background: none;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  padding: 2px 6px;
}
.pr-icon:hover { background: #f3f4f6; color: #111827; }
.pr-para-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  border: none;
  border-radius: 6px;
  background: #f9fafb;
  padding: 5px 0;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
}
.pr-para-btn:hover { background: #f3f4f6; }
`;
