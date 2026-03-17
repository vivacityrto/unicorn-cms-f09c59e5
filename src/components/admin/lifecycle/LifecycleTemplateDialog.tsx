import { useEffect, useState } from "react";
import { FormModal, FormModalSection, FormModalRow } from "@/components/ui/modals";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LifecycleTemplate, LifecycleDropdownItem } from "@/hooks/useLifecycleChecklists";

interface Props {
  open: boolean;
  onClose: () => void;
  template: LifecycleTemplate | null;
  categories: LifecycleDropdownItem[];
  responsibleRoles: LifecycleDropdownItem[];
  onSave: (data: Partial<LifecycleTemplate>) => void;
  saving: boolean;
}

export function LifecycleTemplateDialog({
  open,
  onClose,
  template,
  categories,
  responsibleRoles,
  onSave,
  saving,
}: Props) {
  const [stepTitle, setStepTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [responsibleRole, setResponsibleRole] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isDefault, setIsDefault] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      if (template) {
        setStepTitle(template.step_title);
        setDescription(template.description ?? "");
        setCategory(template.category);
        setResponsibleRole(template.responsible_role ?? "");
        setExternalLink(template.external_link ?? "");
        setSortOrder(template.sort_order);
        setIsDefault(template.is_default);
        setIsActive(template.is_active);
      } else {
        setStepTitle("");
        setDescription("");
        setCategory(categories[0]?.code ?? "");
        setResponsibleRole("");
        setExternalLink("");
        setSortOrder(0);
        setIsDefault(true);
        setIsActive(true);
      }
    }
  }, [open, template, categories]);

  function handleSubmit() {
    onSave({
      step_title: stepTitle,
      description: description || null,
      category,
      responsible_role: responsibleRole && responsibleRole !== "__none__" ? responsibleRole : null,
      external_link: externalLink || null,
      sort_order: sortOrder,
      is_default: isDefault,
      is_active: isActive,
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={template ? "Edit Checklist Step" : "Add Checklist Step"}
      description={template ? "Update this checklist template step" : "Create a new checklist template step"}
      onSubmit={handleSubmit}
      submitText={template ? "Save Changes" : "Create Step"}
      isSubmitting={saving}
      size="lg"
    >
      <FormModalSection>
        <div className="space-y-4">
          <div>
            <Label htmlFor="step-title">Step Title *</Label>
            <Input
              id="step-title"
              value={stepTitle}
              onChange={(e) => setStepTitle(e.target.value)}
              placeholder="e.g. Add user to M365 Business Growth Team group"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed instructions for this step..."
              rows={3}
            />
          </div>

          <FormModalRow>
            <div>
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Responsible Role</Label>
              <Select value={responsibleRole} onValueChange={setResponsibleRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {responsibleRoles.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormModalRow>

          <FormModalRow>
            <div>
              <Label htmlFor="external-link">External Link</Label>
              <Input
                id="external-link"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://admin.microsoft.com/..."
              />
            </div>
            <div>
              <Label htmlFor="sort-order">Sort Order</Label>
              <Input
                id="sort-order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </FormModalRow>

          <FormModalRow>
            <div className="flex items-center gap-3">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} id="is-default" />
              <Label htmlFor="is-default" className="cursor-pointer">
                Default step (pre-selected when generating checklists)
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="is-active" />
              <Label htmlFor="is-active" className="cursor-pointer">Active</Label>
            </div>
          </FormModalRow>
        </div>
      </FormModalSection>
    </FormModal>
  );
}
