import React from "react";

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; text?: string; children?: React.ReactNode; tone?: "danger" }> = ({
  icon,
  title,
  text,
  children,
  tone,
}) => (
  <div className={`ga-empty${tone ? ` ga-empty--${tone}` : ""}`}>
    <div className="ga-empty__icon">{icon}</div>
    <div className="ga-empty__title">{title}</div>
    {text && <div className="ga-empty__text">{text}</div>}
    {children}
  </div>
);

export const SkeletonList: React.FC = () => (
  <div className="ga-skel" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="ga-skel__card">
        <div className="ga-skel__disc" />
        <div className="ga-skel__lines">
          <div className="ga-skel__line" style={{ width: `${80 - i * 10}%` }} />
          <div className="ga-skel__line ga-skel__line--short" />
        </div>
      </div>
    ))}
  </div>
);
