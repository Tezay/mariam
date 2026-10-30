import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const [shown, setShown] = React.useState(false);
    const input = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => input.current as HTMLInputElement);

    // Masked again before sending, so a password manager still sees a password field.
    React.useEffect(() => {
      const form = input.current?.form;
      if (!form) return;
      const hide = () => setShown(false);
      form.addEventListener('submit', hide);
      return () => form.removeEventListener('submit', hide);
    }, []);

    return (
      <div className={cn('relative', className)}>
        <Input
          ref={input}
          type={shown ? 'text' : 'password'}
          disabled={disabled}
          // Keeps the shown text away from the browser's online spell checker.
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="pr-10 [&::-ms-reveal]:hidden"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          disabled={disabled}
          aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
