import TaskDetailClient from "@/components/TaskDetailClient";

export default function TaskDetailPage({
  params,
}: {
  params: { taskId: string };
}) {
  return <TaskDetailClient taskId={params.taskId} />;
}
