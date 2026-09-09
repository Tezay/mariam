import { useCallback, useEffect, useRef, useState } from 'react';
import { PartyPopper, Pencil } from 'lucide-react';
import { voteApi, type VoteDishGroup, type VoteState } from '@/lib/api';
import { getDeviceId } from '@/lib/device-id';
import { deviceFingerprint } from '@/lib/device-fingerprint';
import {
  RATING_LEVELS,
  ratingLevel,
  ratingPreset,
  type RatingValue,
} from '@/features/rating/scale';
import { RatingIcons } from '@/features/rating/RatingIcons';
import { cn } from '@/lib/utils';

/**
 * Rating card for today's menu.
 *
 * An unreachable API hides the card rather than surfacing an error: a student
 * came to read the menu, and a broken counter must never get in the way. A
 * refusal is different — it is the guard working, and it is explained.
 */
export function MobileVoteCard({ siteSlug }: { siteSlug: string }) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [state, setState] = useState<VoteState | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dishesDismissed, setDishesDismissed] = useState(false);
  const celebrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getDeviceId();
        if (!token) throw new Error('no device token');
        const next = await voteApi.getState(siteSlug, token);
        if (cancelled) return;
        setDeviceId(token);
        setState(next);
        celebrated.current = next.vote !== null;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  const submit = useCallback(
    async (rating: RatingValue, dishIds: number[]) => {
      if (!deviceId) return;
      setPending(true);
      try {
        const fingerprint = await deviceFingerprint();
        const result = await voteApi.cast(siteSlug, {
          device_id: deviceId,
          rating,
          dish_ids: dishIds,
          fingerprint,
        });
        setState((previous) => (previous ? { ...previous, vote: result.vote } : previous));
        setEditing(false);
        if (!celebrated.current) {
          celebrated.current = true;
          celebrate();
        }
      } catch (error) {
        const response = (error as { response?: { status: number; data?: { error?: string } } })
          .response;
        if (response && response.status !== 500) {
          setRefusal(response.data?.error ?? 'Votre avis n’a pas pu être enregistré.');
        } else {
          setFailed(true);
        }
      } finally {
        setPending(false);
      }
    },
    [deviceId, siteSlug]
  );

  if (failed || !state?.voting_open) return null;

  if (refusal) {
    return (
      <section className="mx-4 mb-6 rounded-3xl border border-gray-100 bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-gray-500">{refusal}</p>
      </section>
    );
  }

  const vote = state.vote;
  const groups = state.dish_groups;
  // A dish the site stopped offering must not be resent: the server would
  // refuse the whole vote, including a simple change of rating.
  const offered = new Set(groups.flatMap((group) => group.dishes.map((dish) => dish.id)));
  const chosen = (vote?.dish_ids ?? []).filter((id) => offered.has(id));
  const showLevels = vote === null || editing;
  const preset = ratingPreset(state.icon_preset);

  return (
    <section className="mx-4 mb-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      {showLevels ? (
        <>
          <h2 className="text-center text-base font-semibold text-gray-800">
            Ce menu vous a plu ?
          </h2>
          <p className="mt-1 text-center text-xs text-gray-400">
            Votre avis, c'est anonyme, et ça aide votre restaurant.
          </p>
          <div className="mt-4 flex items-stretch justify-center gap-3">
            {RATING_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                disabled={pending}
                onClick={() => submit(level.value, chosen)}
                aria-pressed={vote?.rating === level.value}
                className={cn(
                  'flex min-h-[76px] flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 transition-all active:scale-[0.96] disabled:opacity-60',
                  vote?.rating === level.value
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                )}
              >
                <RatingIcons preset={preset} value={level.value} className="h-7 w-7" />
                <span className="text-center text-[11px] font-medium leading-tight">
                  {level.label}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <RecordedAnswer
          rating={vote.rating}
          onEdit={() => {
            // Reopening the answer reopens all of it, dish included.
            setEditing(true);
            setDishesDismissed(false);
          }}
        />
      )}

      {vote !== null && !dishesDismissed && groups.length > 0 && (
        <DishFollowUp
          groups={groups}
          chosen={chosen}
          disabled={pending}
          onPick={(dishIds) => submit(vote.rating, dishIds)}
          onDismiss={() => setDishesDismissed(true)}
        />
      )}
    </section>
  );
}

function celebrate() {
  import('canvas-confetti')
    .then(({ default: confetti }) => {
      confetti({
        particleCount: 70,
        spread: 60,
        startVelocity: 32,
        origin: { y: 0.8 },
        disableForReducedMotion: true,
      });
    })
    .catch(() => {});
}

function RecordedAnswer({ rating, onEdit }: { rating: RatingValue; onEdit: () => void }) {
  const level = ratingLevel(rating);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <PartyPopper className="h-6 w-6 text-primary" />
      </span>
      <div>
        <p className="text-base font-semibold text-gray-800">Merci pour votre retour !</p>
        <p className="mt-0.5 text-sm text-gray-500">
          Vous avez répondu «&nbsp;{level?.label}&nbsp;»
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 active:scale-[0.97]"
      >
        <Pencil className="h-3 w-3" />
        Modifier ma réponse
      </button>
    </div>
  );
}

function DishFollowUp({
  groups,
  chosen,
  disabled,
  onPick,
  onDismiss,
}: {
  groups: VoteDishGroup[];
  chosen: number[];
  disabled: boolean;
  onPick: (dishIds: number[]) => void;
  onDismiss: () => void;
}) {
  const pick = (group: VoteDishGroup, dishId: number) => {
    const others = chosen.filter((id) => !group.dishes.some((dish) => dish.id === id));
    onPick(chosen.includes(dishId) ? others : [...others, dishId]);
  };

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <p className="text-center text-xs font-medium text-gray-500">
        Vous avez pris quoi ? <span className="font-normal text-gray-400">(facultatif)</span>
      </p>
      {groups.map((group) => (
        <div key={group.category_id} className="mt-3">
          {groups.length > 1 && (
            <p className="mb-1.5 text-center text-[11px] uppercase tracking-wide text-gray-300">
              {group.label}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {group.dishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                disabled={disabled}
                onClick={() => pick(group, dish.id)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs transition-colors active:scale-[0.97] disabled:opacity-60',
                  chosen.includes(dish.id)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-200 text-gray-600'
                )}
              >
                {dish.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        className="mx-auto mt-3 block text-xs text-gray-400 underline transition-colors hover:text-gray-600"
      >
        {chosen.length > 0 ? 'Terminer' : 'Ignorer'}
      </button>
    </div>
  );
}
