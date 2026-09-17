import Badge from '@/components/ui/Badge';
import { busStateLabel, busStateTone } from '@/lib/fleet';

/**
 * Em viagem (blue) · Disponível (green) · Manutenção (amber) · Fora de serviço
 * (grey). The blue matters: the app is green, so "Disponível" and the brand
 * would otherwise be the same colour (§8.1).
 */
export default function BusStateBadge({ state, className }) {
  return (
    <Badge tone={busStateTone(state)} className={className}>
      {busStateLabel(state)}
    </Badge>
  );
}
