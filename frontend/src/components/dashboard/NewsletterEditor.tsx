import { useEffect, useRef } from "react"
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { NewsletterItem, NewsletterJson } from "@/lib/api"

/**
 * Inline-editable text, styled to blend into the plain layout until
 * touched — a subtle dashed outline on hover, a solid one + faint
 * background on focus. Controlled <textarea> (not contentEditable) for
 * reliability: contentEditable's cursor-jump/paste quirks are a well-known
 * footgun in React; a controlled textarea has none of that and still reads
 * as "click and type in place" to the user.
 */
function EditableText({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={cn(
        "block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent p-1 -m-1 outline-none",
        "hover:border-neutral-300 hover:border-dashed",
        "focus:border-neutral-400 focus:border-solid focus:bg-neutral-50",
        className,
      )}
    />
  )
}

function ItemControls({
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
}: {
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  return (
    <div className="flex shrink-0 gap-0.5 opacity-40 transition-opacity group-hover:opacity-100">
      <Button variant="ghost" size="icon-xs" disabled={!canMoveUp} onClick={onMoveUp} aria-label="Move up">
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-xs" disabled={!canMoveDown} onClick={onMoveDown} aria-label="Move down">
        <ArrowDown />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Remove">
        <X />
      </Button>
    </div>
  )
}

function moveWithin<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}

interface NewsletterEditorProps {
  newsletter: NewsletterJson
  onChange: (newsletter: NewsletterJson) => void
  itemsHeading: string
}

/**
 * Editable counterpart to NewsletterBody. Deliberately editable ONLY where
 * the AI actually authors content — title, intro, whyBuilt, items,
 * meansToYou. navigation/whatsNext/footer stay read-only: they're
 * code-assembled deterministic scaffolding (see writerProvider.ts), never
 * model output, so there's nothing here for a human to review or correct.
 */
export function NewsletterEditor({ newsletter, onChange, itemsHeading }: NewsletterEditorProps) {
  const update = <K extends keyof NewsletterJson>(key: K, value: NewsletterJson[K]) => {
    onChange({ ...newsletter, [key]: value })
  }

  const updateItem = (index: number, patch: Partial<NewsletterItem>) => {
    onChange({ ...newsletter, items: newsletter.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) })
  }
  const removeItem = (index: number) => {
    onChange({ ...newsletter, items: newsletter.items.filter((_, i) => i !== index) })
  }
  const moveItem = (index: number, direction: -1 | 1) => {
    onChange({ ...newsletter, items: moveWithin(newsletter.items, index, direction) })
  }
  const addItem = () => {
    onChange({ ...newsletter, items: [...newsletter.items, { name: "New item", body: "" }] })
  }

  const updateMeansToYou = (index: number, value: string) => {
    onChange({ ...newsletter, meansToYou: newsletter.meansToYou.map((m, i) => (i === index ? value : m)) })
  }
  const removeMeansToYou = (index: number) => {
    onChange({ ...newsletter, meansToYou: newsletter.meansToYou.filter((_, i) => i !== index) })
  }
  const moveMeansToYou = (index: number, direction: -1 | 1) => {
    onChange({ ...newsletter, meansToYou: moveWithin(newsletter.meansToYou, index, direction) })
  }
  const addMeansToYou = () => {
    onChange({ ...newsletter, meansToYou: [...newsletter.meansToYou, ""] })
  }

  return (
    <div
      className="mx-auto w-full max-w-[600px] rounded-lg bg-white p-6 text-neutral-900"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <EditableText
        value={newsletter.title}
        onChange={(v) => update("title", v)}
        className="mb-4 text-2xl font-bold leading-snug"
      />

      <EditableText value={newsletter.intro} onChange={(v) => update("intro", v)} className="mb-4 leading-relaxed" />

      {newsletter.whyBuilt !== null ? (
        <>
          <div className="mt-6 mb-2 flex items-center gap-2">
            <h2 className="text-lg font-semibold">Why We Built This</h2>
            <Button variant="ghost" size="icon-xs" onClick={() => update("whyBuilt", null)} aria-label="Remove Why We Built This">
              <X />
            </Button>
          </div>
          <EditableText value={newsletter.whyBuilt} onChange={(v) => update("whyBuilt", v)} className="mb-4 leading-relaxed" />
        </>
      ) : (
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => update("whyBuilt", "")}>
          <Plus /> Add Why We Built This
        </Button>
      )}

      {newsletter.navigation.length > 0 && (
        <p className="mb-4 leading-relaxed [overflow-wrap:break-word] text-neutral-500">
          You can find it in: {newsletter.navigation.join(" → ")}
        </p>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold">{itemsHeading}</h2>
      {newsletter.items.map((item, index) => (
        <div key={index} className="group mb-4 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <EditableText value={item.name} onChange={(v) => updateItem(index, { name: v })} className="font-bold leading-relaxed" />
            <EditableText value={item.body} onChange={(v) => updateItem(index, { body: v })} className="leading-relaxed" />
          </div>
          <ItemControls
            onMoveUp={() => moveItem(index, -1)}
            onMoveDown={() => moveItem(index, 1)}
            onRemove={() => removeItem(index)}
            canMoveUp={index > 0}
            canMoveDown={index < newsletter.items.length - 1}
          />
        </div>
      ))}
      <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={addItem}>
        <Plus /> Add item
      </Button>

      <h2 className="mb-2 mt-6 text-lg font-semibold">What This Means To You</h2>
      {newsletter.meansToYou.map((point, index) => (
        <div key={index} className="group mb-1 flex items-start gap-2">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-400" />
          <div className="min-w-0 flex-1">
            <EditableText value={point} onChange={(v) => updateMeansToYou(index, v)} className="leading-relaxed" />
          </div>
          <ItemControls
            onMoveUp={() => moveMeansToYou(index, -1)}
            onMoveDown={() => moveMeansToYou(index, 1)}
            onRemove={() => removeMeansToYou(index)}
            canMoveUp={index > 0}
            canMoveDown={index < newsletter.meansToYou.length - 1}
          />
        </div>
      ))}
      <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={addMeansToYou}>
        <Plus /> Add bullet
      </Button>

      {newsletter.whatsNext && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">What's Next</h2>
          <p className="mb-4 leading-relaxed [overflow-wrap:break-word] text-neutral-500">{newsletter.whatsNext}</p>
        </>
      )}

      <hr className="my-4 border-neutral-200" />

      <p className="text-sm leading-relaxed text-neutral-600">{newsletter.footer.address}</p>
      <p className="text-sm leading-relaxed text-neutral-600">{newsletter.footer.city}</p>
      <a href={newsletter.footer.websiteUrl} className="text-sm font-medium underline">
        VISIT WEBSITE
      </a>
    </div>
  )
}
