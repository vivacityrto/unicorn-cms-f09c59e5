export interface Resource {
  id: string;
  title: string;
  description: string | null;
  category: string;
  file_url: string | null;
  video_url: string | null;
  version: string;
  tags: string[];
  access_level: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
  is_favourite: boolean;
}

export interface ResourceCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  path: string;
}

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    id: 'templates',
    label: 'Templates',
    description: 'Policy templates, TAS templates, and more',
    icon: 'FileText',
    path: '/resource-hub/templates'
  },
  {
    id: 'checklists',
    label: 'Checklists',
    description: 'Audit prep, enrolment, and compliance checklists',
    icon: 'CheckSquare',
    path: '/resource-hub/checklists'
  },
  {
    id: 'registers-forms',
    label: 'Registers & Forms',
    description: 'Registers, logs, and standard forms',
    icon: 'ClipboardList',
    path: '/resource-hub/registers-forms'
  },
  {
    id: 'audit-evidence',
    label: 'Audit & Evidence Tools',
    description: 'Self-assessment tools and evidence guides',
    icon: 'Search',
    path: '/resource-hub/audit-evidence'
  },
  {
    id: 'training-webinars',
    label: 'Training & Webinars',
    description: 'Recorded training sessions and webinars',
    icon: 'Video',
    path: '/resource-hub/training-webinars'
  },
  {
    id: 'guides-howto',
    label: 'Guides & How-To',
    description: 'Step-by-step guides and best practices',
    icon: 'BookOpen',
    path: '/resource-hub/guides-howto'
  },
  {
    id: 'ci-tools',
    label: 'CI Tools',
    description: 'Continuous improvement tracking tools',
    icon: 'TrendingUp',
    path: '/resource-hub/ci-tools'
  }
];

export const getCategoryLabel = (categoryId: string): string => {
  const category = RESOURCE_CATEGORIES.find(c => c.id === categoryId);
  return category?.label || categoryId;
};

export const getCategoryIcon = (categoryId: string): string => {
  const category = RESOURCE_CATEGORIES.find(c => c.id === categoryId);
  return category?.icon || 'FileText';
};

/** Returns the client-namespaced path for a resource category */
export const getClientCategoryPath = (categoryId: string): string => {
  return `/client/resource-hub/${categoryId}`;
};
