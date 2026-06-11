export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  parentCategoryId: string | null;
  displayOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}
