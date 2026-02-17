import { useState, useCallback } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Chore, ChoreDefinition } from '../../types';
import {
  choreToFormState,
  formStateToChoreDefinition,
  getDefaultFormState,
  type EditorFormState,
} from '../utils/editorMappers';

interface UseChoreFormOptions {
  addChore: (def: ChoreDefinition) => void;
  updateChore: (oldSubject: string, def: ChoreDefinition) => void;
}

export default function useChoreForm({ addChore, updateChore }: UseChoreFormOptions) {
  const [formValues, setFormValues] = useState<EditorFormState>(getDefaultFormState());
  const [isOpen, setIsOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);

  const openCreateForm = useCallback(() => {
    setFormValues(getDefaultFormState());
    setEditingSubject(null);
    setIsOpen(true);
  }, []);

  const openEditForm = useCallback((chore: Chore) => {
    setFormValues(choreToFormState(chore));
    setEditingSubject(chore.subject);
    setIsOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    setIsOpen(false);
    setEditingSubject(null);
  }, []);

  const toggleMember = useCallback((member: string) => {
    setFormValues((prev) => {
      const members = prev.fixedMembers.includes(member)
        ? prev.fixedMembers.filter((m) => m !== member)
        : [...prev.fixedMembers, member];
      return { ...prev, fixedMembers: members };
    });
  }, []);

  const addToRotation = useCallback((member: string) => {
    setFormValues((prev) => {
      if (prev.rotationMembers.includes(member)) return prev;
      return { ...prev, rotationMembers: [...prev.rotationMembers, member] };
    });
  }, []);

  const removeFromRotation = useCallback((member: string) => {
    setFormValues((prev) => ({
      ...prev,
      rotationMembers: prev.rotationMembers.filter((m) => m !== member),
    }));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFormValues((prev) => {
      const oldIndex = prev.rotationMembers.indexOf(String(active.id));
      const newIndex = prev.rotationMembers.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, rotationMembers: arrayMove(prev.rotationMembers, oldIndex, newIndex) };
    });
  }, []);

  const toggleDayOfWeek = useCallback((day: number) => {
    setFormValues((prev) => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter((d) => d !== day)
        : [day],
    }));
  }, []);

  const handleSave = useCallback((): string | null => {
    const subject = formValues.subject.trim();
    if (!subject) return 'Subject is required';

    if (formValues.assignmentType === 'fixed' && formValues.fixedMembers.length === 0) {
      return 'Select at least one member';
    }

    if (formValues.assignmentType === 'rotating' && formValues.rotationMembers.length < 2) {
      return 'Rotation requires at least 2 members';
    }

    const def = formStateToChoreDefinition(
      formValues,
      editingSubject ? undefined : undefined
    );

    if (editingSubject) {
      if (editingSubject !== def.subject) {
        const confirmed = window.confirm(
          'Rename will move existing completion history to the new name. Continue?'
        );
        if (!confirmed) return null;
      }
      updateChore(editingSubject, def);
    } else {
      addChore(def);
    }

    closeForm();
    return null;
  }, [formValues, editingSubject, addChore, updateChore, closeForm]);

  return {
    formValues,
    setFormValues,
    isOpen,
    editingSubject,
    openCreateForm,
    openEditForm,
    closeForm,
    toggleMember,
    addToRotation,
    removeFromRotation,
    handleDragEnd,
    toggleDayOfWeek,
    handleSave,
  };
}
