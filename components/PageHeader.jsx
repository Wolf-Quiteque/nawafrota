export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3 pt-1">
      <div>
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
