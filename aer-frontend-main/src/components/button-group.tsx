type ButtonGroupOption<T> = {
  label: string;
  sublabel?: string;
  value: T;
};

type ButtonGroupProps<T extends string | number> = {
  options: ButtonGroupOption<T>[];
  /** Pass null to show no selection (uncontrolled initial state). */
  value: T | null;
  onChange: (value: T) => void;
};

export default function ButtonGroup<T extends string | number>({
  options,
  value,
  onChange,
}: ButtonGroupProps<T>) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {options.map((opt) => {
        const active = value !== null && opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full min-w-0 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all duration-150 sm:w-auto sm:px-4 ${
              active
                ? "border-[#d4a54f] bg-[linear-gradient(180deg,rgba(46,34,13,0.96),rgba(24,18,8,0.96))] text-[#f7f1e8]"
                : "border-[#d4a54f29] bg-[linear-gradient(180deg,rgba(24,24,24,0.92),rgba(10,10,10,0.97))] text-[#d9dde6] hover:border-[#d4a54f99] hover:bg-[linear-gradient(180deg,rgba(30,30,30,0.94),rgba(12,12,12,0.98))]"
            }`}
          >
            <span className="block break-words">{opt.label}</span>
            {opt.sublabel ? (
              <span
                className={`block text-xs font-normal mt-0.5 ${
                  active ? "text-[#d6c298]" : "text-[#8a94a8]"
                }`}
              >
                {opt.sublabel}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
