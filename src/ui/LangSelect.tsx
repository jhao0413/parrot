import { LANGUAGES, LANG_CODES } from '@/translate/lang';

export function LangSelect({
  value,
  onChange,
  includeAuto,
  autoLabel = '自动检测',
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  includeAuto?: boolean;
  /** 「自动」选项的文案（源语言默认"自动检测"；目标语言可用作"中⇄英"） */
  autoLabel?: string;
  className?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        'rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none'
      }
    >
      {includeAuto && <option value="auto">{autoLabel}</option>}
      {LANG_CODES.map((code) => (
        <option key={code} value={code}>
          {LANGUAGES[code as keyof typeof LANGUAGES]}
        </option>
      ))}
    </select>
  );
}
