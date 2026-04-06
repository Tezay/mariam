import { useRef, useEffect } from 'react';
import { ChefHat } from 'lucide-react';

interface MobileChefNoteProps {
    note: string;
}

/** Bandeau note du chef */
export function MobileChefNote({ note }: MobileChefNoteProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const animFrameRef = useRef<number>(0);
    const directionRef = useRef<1 | -1>(1);
    const pauseRef = useRef(false);
    const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const speed = 0.6;

        function tick() {
            if (!pauseRef.current) {
                const el = scrollRef.current;
                if (el) {
                    el.scrollLeft += speed * directionRef.current;
                    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
                    const atStart = el.scrollLeft <= 0;
                    if (
                        (directionRef.current === 1 && atEnd) ||
                        (directionRef.current === -1 && atStart)
                    ) {
                        pauseRef.current = true;
                        pauseTimerRef.current = setTimeout(() => {
                            directionRef.current = (directionRef.current === 1 ? -1 : 1) as 1 | -1;
                            pauseRef.current = false;
                        }, 1500);
                    }
                }
            }
            animFrameRef.current = requestAnimationFrame(tick);
        }

        // Démarrer uniquement si le contenu déborde
        const timer = setTimeout(() => {
            const el = scrollRef.current;
            if (el && el.scrollWidth > el.clientWidth) {
                animFrameRef.current = requestAnimationFrame(tick);
            }
        }, 0);

        return () => {
            clearTimeout(timer);
            cancelAnimationFrame(animFrameRef.current);
            if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        };
    }, [note]);

    return (
        <div
            ref={scrollRef}
            className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden shrink-0"
        >
            <ChefHat className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm italic text-amber-800">
                Note du chef : « {note} »
            </p>
        </div>
    );
}
