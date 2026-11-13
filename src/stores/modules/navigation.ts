import { defineStore } from 'pinia'

export const useNavigationStore = defineStore('navigation', {
  state: () => ({ loading: false }),
})
