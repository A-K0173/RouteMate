import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { dayColour } from '../dayColours'
import { dayTotalMinutes } from '../travel'

// one stop that can be dragged up and down inside its day
function SortableStop({ stop, day, allDays, onMove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.placeId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className="stop">
      <span className="drag-handle" {...attributes} {...listeners} title="Drag to reorder">
        ⠿
      </span>
      <span className="stop-number" style={{ background: dayColour(day.dayNumber) }}>
        {stop.order}
      </span>
      <div className="stop-text">
        <strong>{stop.name}</strong>
        <span className="muted">
          {stop.order === 1 ? 'Start of the day' : stop.travelMinFromPrevious + ' min walk from previous'}
        </span>
      </div>
      <select
        value={day.dayNumber}
        onChange={(event) => onMove(stop.placeId, day.dayNumber, Number(event.target.value))}
        title="Move to another day"
      >
        {allDays.map((otherDay) => (
          <option key={otherDay.dayNumber} value={otherDay.dayNumber}>
            Day {otherDay.dayNumber}
          </option>
        ))}
      </select>
    </li>
  )
}

function DayList({ day, allDays, onReorder, onMove }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = day.stops.findIndex((stop) => stop.placeId === active.id)
    const newIndex = day.stops.findIndex((stop) => stop.placeId === over.id)
    onReorder(day.dayNumber, arrayMove(day.stops, oldIndex, newIndex))
  }

  const total = dayTotalMinutes(day.stops)

  return (
    <section className="day">
      <h3 style={{ borderColor: dayColour(day.dayNumber) }}>
        Day {day.dayNumber}
        <span className="muted">
          {day.stops.length} {day.stops.length === 1 ? 'stop' : 'stops'} · {total} min walking
        </span>
      </h3>
      {day.stops.length === 0 && <p className="muted">No stops planned. Move a stop here.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={day.stops.map((stop) => stop.placeId)} strategy={verticalListSortingStrategy}>
          <ol className="stop-list">
            {day.stops.map((stop) => (
              <SortableStop key={stop.placeId} stop={stop} day={day} allDays={allDays} onMove={onMove} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  )
}

export default DayList
