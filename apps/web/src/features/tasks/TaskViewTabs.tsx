import { Tabs } from "../../components/ui";
import type { TaskView } from "../../lib/viewTypes";
import { goTaskViewTab, taskViewTabs, type TaskViewMode } from "../../lib/domain";

export function TaskViewTabs({
  value,
  tasks,
  onChange
}: {
  value: TaskViewMode;
  tasks: TaskView[];
  onChange?: (value: TaskViewMode) => void;
}) {
  return (
    <div className="tabs-section">
      <Tabs
        variant="primary"
        value={value}
        onChange={(next) => {
          const tab = next as TaskViewMode;
          onChange?.(tab);
          goTaskViewTab(tab);
        }}
        tabs={taskViewTabs(tasks)}
      />
    </div>
  );
}
