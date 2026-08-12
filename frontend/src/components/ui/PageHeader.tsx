type PageHeaderProps = {
  title: string;
  description?: string;
  meta?: string;
};

export default function PageHeader({ title, description, meta }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {meta ? <span className="page-meta">{meta}</span> : null}
    </header>
  );
}
