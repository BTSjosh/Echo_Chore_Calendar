import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  id: string;
  index: number;
  onRemove: (member: string) => void;
}

export default function SortableRotationItem({ id, index, onRemove }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl bg-[#2A3136] px-4 py-3 border border-slate-700"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 select-none text-lg"
        title="Drag to reorder"
      >
        &#x2630;
      </span>
      <span className="text-sm font-semibold text-green-400 w-6">{index + 1}.</span>
      <span className="flex-1 text-slate-100 font-medium">{id}</span>
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="text-red-400 hover:text-red-300 text-lg font-bold leading-none"
        title="Remove"
      >
        &times;
      </button>
    </div>
  );
}
