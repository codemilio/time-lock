/** Lista de cápsulas reveladas (`/reveladas`). */

import ReadableCapsuleList from "../components/ReadableCapsuleList";

export default function RevealedList() {
  return (
    <ReadableCapsuleList
      status="revealed"
      title="Reveladas"
      description="Mensagens que chegaram ao destino e estão prontas para você ler."
      emptyMessage="Nenhuma cápsula revelada ainda. Sua próxima mensagem aguarda a data escolhida."
    />
  );
}
