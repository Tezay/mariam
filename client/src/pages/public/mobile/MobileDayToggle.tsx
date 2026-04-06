interface MobileDayToggleProps {
    selected: 'today' | 'tomorrow';
    onChange: (day: 'today' | 'tomorrow') => void;
}

/** Onglets Aujourd'hui / Demain */
export function MobileDayToggle({ selected, onChange }: MobileDayToggleProps) {
    return (
        <div className="flex gap-2 px-4 py-3 bg-white border-b border-gray-100 shrink-0">
            <button
                type="button"
                onClick={() => onChange('today')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selected === 'today'
                        ? 'bg-mariam-blue text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500'
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
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
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
