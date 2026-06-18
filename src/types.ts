/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SystemUser {
  id: string; // UUID
  username: string;
  name: string;
  avatarColor: string; // Hex or tailwind class
  passwordHash: string; // crypto.subtle hashed with salt
  salt: string; // crypto.subtle salt
  createdAt: number;
  isSuperAdmin?: boolean; // First user of a new project is marked as superadmin
  docViewModes?: Record<string, 'edit' | 'preview' | 'split'>;
  readNotes?: Record<string, number>; // { [logId]: timestamp_when_read } - tracks which notes the user has read
}

export interface ProjectConfig {
  projectId: string;
  projectName: string;
  lastOpenedBy?: string;
  lastModified: number;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  description: string;
  created: number;
  tags: string[];
}

export interface TaskStatus {
  id: string;
  name: string;
  color: string; // Hex color
  isCompleted: boolean;
}

export interface TaskList {
  id: string; // UUID
  name: string;
  color: string;
  statuses: TaskStatus[];
  createdAt: number;
}

export interface Subtask {
  id: string; // UUID
  title: string;
  isCompleted: boolean;
  createdAt: number;
}

export interface Task {
  id: string; // UUID
  taskCode: string; // e.g. TASK-001
  listId: string; // List UUID
  title: string;
  description: string; // Markdown / Plain text
  statusId: string; // Status ID
  dueDate: string; // YYYY-MM-DD
  assignees: string[]; // List of User UUIDs
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  dependencies: string[]; // List of Task UUIDs
  subtasks: Subtask[];
  lastEditedBy?: string; // User UUID
  lastEditedAt?: number;
}

export interface ActivityComment {
  id: string;
  userId: string;
  username: string;
  text: string; // Markdown note/comment
  createdAt: number;
  attachments?: string[]; // list of attachment file paths
}

export interface TaskActivityLog {
  id: string;
  taskId: string;
  userId: string;
  username: string;
  action: string; // e.g. "created the task", "changed status to Done"
  timestamp: number;
  comment?: ActivityComment;
}

export interface ProjectLog {
  id: string;
  userId: string;
  username: string;
  action: string;
  details: string;
  timestamp: number;
}

export interface DocMetadata {
  id: string;
  title: string;
  filename: string; // e.g. "guia.md"
  editedBy?: string;
  editedAt?: number;
  createdAt: number;
}

export interface TaskLock {
  userId: string;
  username: string;
  expiresAt: number;
}

export type TrashItemType = 'task' | 'document' | 'media';

export interface TrashItem {
  id: string; // UUID
  type: TrashItemType;
  originalData: any; // The original item data (task, doc metadata, or media info)
  originalPath?: string; // Original file path (for media)
  deletedAt: number;
  deletedBy: string; // User ID
  deletedByName: string;
  label: string; // Display name
  metadata?: {
    taskCode?: string;
    docFilename?: string;
    mediaType?: 'image' | 'video';
  };
}

export interface ProjectLocks {
  [taskId: string]: TaskLock;
}

/**
 * A project registered in the project browser.
 */
export interface RegisteredProject {
  id: string;
  name: string;
  type: 'FSA_API';
  createdAt: number;
  /** Path hint for display purposes (FSA only) */
  pathHint?: string;
}
