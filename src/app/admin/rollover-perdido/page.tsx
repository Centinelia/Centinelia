import { permanentRedirect } from 'next/navigation';

export default function RolloverPerdidoLegacy() {
  permanentRedirect('/admin/pool-perdido?tab=minutos');
}
