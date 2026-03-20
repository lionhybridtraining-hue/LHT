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
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value !== null && opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2.5 rounded-lg border text-sm font-semibold transition-all duration-150 ${
              active
                ? "bg-[#d4a54f] border-[#d4a54f] text-[#111111]"
                : "border-[#d4a54f44] bg-[#2a2a2a] text-[#d9dde6] hover:border-[#d4a54f99] hover:bg-[#333333]"
            }`}
          >
            <span className="block">{opt.label}</span>
            {opt.sublabel ? (
              <span
                className={`block text-xs font-normal mt-0.5 ${
                  active ? "text-[#2a1e00]" : "text-[#8a94a8]"
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
