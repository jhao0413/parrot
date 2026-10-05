import { LANGUAGES, LANG_CODES } from '@/translate/lang';

export function LangSelect({
  value,
  onChange,
  includeAuto,
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  includeAuto?: boolean;
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
        'rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-blue-400 focus:outline-none'
      }
    >
      {includeAuto && <option value="auto">自动检测</option>}
      {LANG_CODES.map((code) => (
        <option key={code} value={code}>
          {LANGUAGES[code as keyof typeof LANGUAGES]}
        </option>
      ))}
    </select>
  );
}
