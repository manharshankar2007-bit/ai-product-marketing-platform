import type { ReactNode } from "react"
import { Plus, Trash2 } from "lucide-react"
import type { NewsletterItem, NewsletterJson } from "@/lib/api"

interface NewsletterEditFormProps {
  newsletter: NewsletterJson
  onChange: (updated: NewsletterJson) => void
}

const fieldLabel = "font-mono text-[10px] font-black uppercase tracking-wide text-gray-500"
const textInput =
  "w-full border-2 border-black bg-white p-2 text-sm text-[#1A1A1A] outline-none focus:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
const textareaClass = `${textInput} resize-y`
const removeBtn =
  "flex size-7 shrink-0 items-center justify-center border-2 border-black bg-white text-red-600 hover:bg-red-50"
const addBtn =
  "flex w-fit items-center gap-1 border-2 border-black bg-[#E0FF00] px-2.5 py-1.5 text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#d3f200] active:translate-y-[1px] active:shadow-none"

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

function StringListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (updated: string[]) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className={fieldLabel}>{label}</label>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...values]
              next[index] = e.target.value
              onChange(next)
            }}
            className={textInput}
          />
          <button type="button" className={removeBtn} onClick={() => onChange(values.filter((_, i) => i !== index))}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <button type="button" className={addBtn} onClick={() => onChange([...values, ""])}>
        <Plus className="size-3.5" />
        <span>Add</span>
      </button>
    </div>
  )
}

function ItemListEditor({
  items,
  onChange,
}: {
  items: NewsletterItem[]
  onChange: (updated: NewsletterItem[]) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className={fieldLabel}>Items</label>
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 border-2 border-black bg-[#F3F4F6] p-3">
          <div className="flex items-start gap-2">
            <input
              type="text"
              value={item.name}
              placeholder="Feature name"
              onChange={(e) => {
                const next = [...items]
                next[index] = { ...next[index], name: e.target.value }
                onChange(next)
              }}
              className={`${textInput} font-bold`}
            />
            <button type="button" className={removeBtn} onClick={() => onChange(items.filter((_, i) => i !== index))}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <textarea
            value={item.body}
            placeholder="Description"
            rows={3}
            onChange={(e) => {
              const next = [...items]
              next[index] = { ...next[index], body: e.target.value }
              onChange(next)
            }}
            className={textareaClass}
          />
        </div>
      ))}
      <button type="button" className={addBtn} onClick={() => onChange([...items, { name: "", body: "" }])}>
        <Plus className="size-3.5" />
        <span>Add Item</span>
      </button>
    </div>
  )
}

export function NewsletterEditForm({ newsletter, onChange }: NewsletterEditFormProps) {
  const set = <K extends keyof NewsletterJson>(key: K, value: NewsletterJson[K]) => {
    onChange({ ...newsletter, [key]: value })
  }

  return (
    <div className="flex w-full flex-1 min-h-0 flex-col gap-5 overflow-y-auto border-4 border-black bg-white p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <Field label="Title">
        <input
          type="text"
          value={newsletter.title}
          onChange={(e) => set("title", e.target.value)}
          className={`${textInput} font-display font-bold`}
        />
      </Field>

      <Field label="Intro">
        <textarea value={newsletter.intro} rows={3} onChange={(e) => set("intro", e.target.value)} className={textareaClass} />
      </Field>

      <Field label="Why We Built This (optional)">
        <textarea
          value={newsletter.whyBuilt ?? ""}
          rows={3}
          placeholder="Leave blank to omit this section"
          onChange={(e) => set("whyBuilt", e.target.value === "" ? null : e.target.value)}
          className={textareaClass}
        />
      </Field>

      <StringListEditor
        label="Navigation Path"
        values={newsletter.navigation}
        onChange={(v) => set("navigation", v)}
        placeholder="e.g. Settings"
      />

      <ItemListEditor items={newsletter.items} onChange={(v) => set("items", v)} />

      <StringListEditor
        label="What This Means To You"
        values={newsletter.meansToYou}
        onChange={(v) => set("meansToYou", v)}
        placeholder="A benefit statement"
      />

      <Field label="What's Next (optional)">
        <textarea value={newsletter.whatsNext} rows={2} onChange={(e) => set("whatsNext", e.target.value)} className={textareaClass} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Footer Address">
          <input
            type="text"
            value={newsletter.footer.address}
            onChange={(e) => set("footer", { ...newsletter.footer, address: e.target.value })}
            className={textInput}
          />
        </Field>
        <Field label="Footer City">
          <input
            type="text"
            value={newsletter.footer.city}
            onChange={(e) => set("footer", { ...newsletter.footer, city: e.target.value })}
            className={textInput}
          />
        </Field>
        <Field label="Website URL">
          <input
            type="text"
            value={newsletter.footer.websiteUrl}
            onChange={(e) => set("footer", { ...newsletter.footer, websiteUrl: e.target.value })}
            className={textInput}
          />
        </Field>
      </div>
    </div>
  )
}
