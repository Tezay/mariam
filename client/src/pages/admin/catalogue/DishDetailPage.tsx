import { useParams } from 'react-router-dom';
import { DishDetailView } from '@/features/catalog/DishDetailView';

export function DishDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DishDetailView dishId={Number(id)} />;
}
