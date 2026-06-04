import DashboardPage from "../DashboardPage";

export default async function Page({ params }: { params: Promise<{ generationId: string }> }) {
  const { generationId } = await params;
  return <DashboardPage initialGenerationId={generationId} />;
}
