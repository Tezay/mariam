import { useParams } from 'react-router';
import { DishDetailView } from '@/features/catalog/DishDetailView';

export function DishDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DishDetailView dishId={Number(id)} />;
}
