import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TagIcon } from '@/components/TagIcon';

describe('TagIcon', () => {
  it('draws a listed icon as itself', () => {
    const { container } = render(<TagIcon name="wheat-off" />);
    expect(container.querySelector('svg')?.classList).toContain('lucide-wheat-off');
  });

  it('draws a neutral icon for a name it does not know', () => {
    const { container } = render(<TagIcon name="no-such-icon" />);
    expect(container.querySelector('svg')?.classList).toContain('lucide-tag');
  });
});
