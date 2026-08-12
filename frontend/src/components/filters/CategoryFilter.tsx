import { ALL_CATEGORY_EMOJI, CATEGORY_EMOJIS, CATEGORY_ORDER } from './categoryIcons';

type CategoryFilterProps = {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
};

function sortCategories(categories: string[]) {
  const known = CATEGORY_ORDER.filter((name) => categories.includes(name));
  const extra = categories
    .filter((name) => !CATEGORY_ORDER.includes(name))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

export default function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
  const items = sortCategories(categories.length ? categories : CATEGORY_ORDER);

  return (
    <section className="category-filter" aria-label="Commodity category">
      <div className="category-filter-grid" role="group" aria-label="Filter by commodity category">
        <button
          type="button"
          className={`category-chip${value === '' ? ' is-active' : ''}`}
          aria-pressed={value === ''}
          title="All categories"
          onClick={() => onChange('')}
        >
          <span className="category-chip-icon" aria-hidden>
            {ALL_CATEGORY_EMOJI}
          </span>
          <span className="category-chip-label">All</span>
        </button>
        {items.map((name) => (
          <button
            key={name}
            type="button"
            className={`category-chip${value === name ? ' is-active' : ''}`}
            aria-pressed={value === name}
            title={name}
            onClick={() => onChange(name)}
          >
            <span className="category-chip-icon" aria-hidden>
              {CATEGORY_EMOJIS[name] ?? '📦'}
            </span>
            <span className="category-chip-label">{name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
