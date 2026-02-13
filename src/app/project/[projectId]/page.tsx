import { ProjectScreen } from '@/components/project/ProjectScreen';

type Params = { projectId: string };

export default async function ProjectPage({ params }: { params: Promise<Params> }) {
  const { projectId } = await params;
  return <ProjectScreen projectId={projectId} />;
}
