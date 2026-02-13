import { ProjectConfirmation } from '@/components/create/ProjectConfirmation';

export default async function ConfirmCreatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <ProjectConfirmation draftId={draftId} />;
}
