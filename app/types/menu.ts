export type Category = {
  id: number
  name: string
  slug: string
  sort_order: number
}

export type Product = {
  id: number
  category_id: number
  name: string
  description: string | null
  price: number
  image_url: string | null
  featured: boolean
  available: boolean
  sort_order: number
}
