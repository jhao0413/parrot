import logoUrl from '../assets/logo.png?inline';

/** 品牌标志内联为 data URL，在页面的 shadow root 中也能稳定加载。 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return <img src={logoUrl} width={size} height={size} alt="" aria-hidden="true" className={className} />;
}
