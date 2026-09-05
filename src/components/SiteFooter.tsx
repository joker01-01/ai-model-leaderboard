import bilibiliIcon from "../assets/brands/bilibili.svg";
import githubIcon from "../assets/brands/github.svg";
import wechatIcon from "../assets/brands/wechat.svg";
import wechatQrCode from "../assets/wechat-qrcode.jpg";

interface SiteFooterProps {
  readonly observedAt: string;
  readonly sourceUrl: string;
}

const EXTERNAL_LINK_PROPS = Object.freeze({
  target: "_blank",
  rel: "noopener noreferrer",
} as const);

export default function SiteFooter({ observedAt, sourceUrl }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="site-footer__socials" role="group" aria-label="社交账号">
        <a
          className="site-footer__social-link"
          href="https://github.com/joker01-01"
          aria-label="GitHub"
          {...EXTERNAL_LINK_PROPS}
        >
          <img className="site-footer__social-icon" src={githubIcon} alt="" />
        </a>
        <a
          className="site-footer__social-link"
          href="https://space.bilibili.com/691663896"
          aria-label="Bilibili"
          {...EXTERNAL_LINK_PROPS}
        >
          <img className="site-footer__social-icon" src={bilibiliIcon} alt="" />
        </a>
        <span className="site-footer__wechat">
          <button
            className="site-footer__social-button"
            type="button"
            aria-label="23号切片二维码"
          >
            <img className="site-footer__social-icon" src={wechatIcon} alt="" />
          </button>
          <span className="site-footer__wechat-popover" aria-hidden="true">
            <img className="site-footer__wechat-qr" src={wechatQrCode} alt="" />
          </span>
        </span>
      </div>

      <p className="site-footer__meta">
        数据来源：
        <a
          className="site-footer__source-link"
          href={sourceUrl}
          {...EXTERNAL_LINK_PROPS}
        >
          Artificial Analysis
        </a>
        <span aria-hidden="true"> · </span>
        <span>更新日期：{observedAt}</span>
      </p>
    </footer>
  );
}
