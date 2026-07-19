interface MobileDayToggleProps {
  selected: 'today' | 'tomorrow';
  onChange: (day: 'today' | 'tomorrow') => void;
}

/** Onglets Aujourd'hui / Demain */
export function MobileDayToggle({ selected, onChange }: MobileDayToggleProps) {
  return (
    <div className="flex shrink-0 gap-2 border-b border-gray-100 bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => onChange('today')}
        className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
          selected === 'today' ? 'bg-mariam-blue text-white shadow-sm' : 'bg-gray-100 text-gray-500'
        }`}
      >
        Aujourd'hui
      </button>
      <button
        type="button"
        onClick={() => {
          onChange('tomorrow');
          window.umami?.track('menu-tomorrow-view');
        }}
        className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
          selected === 'tomorrow'
            ? 'bg-mariam-blue text-white shadow-sm'
            : 'bg-gray-100 text-gray-500'
        }`}
      >
        Demain
      </button>
    </div>
  );
}
