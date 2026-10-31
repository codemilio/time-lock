/** Lista de cápsulas arquivadas (`/arquivadas`). */

import ReadableCapsuleList from "../components/ReadableCapsuleList";

export default function ArchivedList() {
  return (
    <ReadableCapsuleList
      status="archived"
      title="Arquivadas"
      description="Mensagens que você já leu e decidiu guardar."
      emptyMessage="Nenhuma cápsula arquivada."
    />
  );
}
