import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { QK } from '../../constants'
import { toast } from 'sonner'

export function useNotes() {
  return useQuery({
    queryKey: QK.NOTES,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pre_meeting_notes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      user_id: string
      title: string
      content: string | null
      for_meeting_date: string | null
      is_archived: boolean
      tags?: string[]
    }) => {
      // On tente avec tags, si ça échoue on réessaie sans
      const { tags, ...base } = payload
      try {
        const { data, error } = await supabase
          .from('pre_meeting_notes')
          .insert({ ...base, tags: tags ?? [] })
          .select()
          .single()
        if (error) throw error
        return data
      } catch {
        // Fallback sans tags si la colonne n'existe pas encore
        const { data, error } = await supabase
          .from('pre_meeting_notes')
          .insert(base)
          .select()
          .single()
        if (error) throw error
        return data
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.NOTES })
      toast.success('Note créée')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: any) => {
      // Retire tags si la colonne n'existe pas
      const { tags, ...base } = payload
      try {
        const { data, error } = await supabase
          .from('pre_meeting_notes')
          .update({ ...base, tags: tags ?? [] })
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data
      } catch {
        const { data, error } = await supabase
          .from('pre_meeting_notes')
          .update(base)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.NOTES })
      toast.success('Note mise à jour')
    },
    onError: (e: any) => toast.error(e.message),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pre_meeting_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.NOTES })
      toast.success('Note supprimée')
    },
    onError: (e: any) => toast.error(e.message),
  })
}
