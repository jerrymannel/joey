import Link from "next/link";
import TaskForm from "../TaskForm.tsx";

export default function NewTaskPage() {
  return (
    <>
      <p className="crumb">
        <Link href="/tasks">← Tasks</Link>
      </p>
      <div className="page-header">
        <h1>New task</h1>
      </div>
      <p className="muted">Build a <code>tasks/&lt;name&gt;.yaml</code> and save it. It&apos;s validated on save; you can hand-edit the file afterwards.</p>
      <TaskForm />
    </>
  );
}
