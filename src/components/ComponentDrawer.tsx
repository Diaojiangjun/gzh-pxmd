import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Sparkles,
  Plus,
  Copy,
  Check,
  Edit3,
  Trash2,
  CopyCheck,
  Search,
  Eye,
  EyeOff,
  Tag,
  Code2,
  BookmarkPlus,
  ArrowRight,
} from 'lucide-react';
import { BUILTIN_COMPONENTS } from '../data/defaultData';
import { GzhComponentItem } from '../types';
import { storageService } from '../services/storageService';

interface ComponentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSnippet: (snippet: string) => void;
  onToast?: (message: string) => void;
}

// Quick starter templates for custom components
const STARTER_TEMPLATES = [
  {
    name: '醒目提示卡 (callout)',
    category: 'highlight',
    snippet: `:::callout
💡 **读者核心提示**
在此处输入您的核心观点或重点提示内容。
- 要点一：精炼语言，避免冗长
- 要点二：合理搭配关键词加粗
:::`,
  },
  {
    name: '金句引用卡 (quote)',
    category: 'quote',
    snippet: `:::quote
“优秀的设计不是装饰品的堆砌，而是每一个细节都恰如其分。”
—— 现代公众号设计指南
:::`,
  },
  {
    name: '作者文末签名 (footer)',
    category: 'footer',
    snippet: `:::footer
**— 主笔档案 · 关于作者 —**
专注高质量内容写作与视觉排版。如果觉得本文对您有帮助，欢迎点击 **「在看」** 与 **「点赞」**！
作者微信：designer_pro · 欢迎交流
:::`,
  },
  {
    name: '数字徽章小标题 (heading)',
    category: 'heading',
    snippet: `## 01 / 章节核心论点标题
`,
  },
  {
    name: '彩色背景微框 (HTML)',
    category: 'highlight',
    snippet: `<section style="margin: 18px 0; padding: 16px 18px; border-radius: 10px; background-color: #f8fafc; border: 1px dashed #cbd5e1; font-size: 14px; line-height: 1.8;">
  <strong style="color: #0f172a; display: block; margin-bottom: 6px;">📌 特别说明与福利：</strong>
  在此填写专属优惠或活动规则，支持内联样式并在微信后台完美呈现。
</section>`,
  },
];

export const ComponentDrawer: React.FC<ComponentDrawerProps> = ({
  isOpen,
  onClose,
  onInsertSnippet,
  onToast,
}) => {
  const [customComponents, setCustomComponents] = useState<GzhComponentItem[]>(() => {
    return storageService.getCustomComponents();
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'custom' | 'builtin' | string>('all');

  // Custom component creator/editor state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('highlight');
  const [formDescription, setFormDescription] = useState('');
  const [formSnippet, setFormSnippet] = useState('');
  const [showFormPreview, setShowFormPreview] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFormOpen) {
          setIsFormOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFormOpen, onClose]);

  // Sync custom components whenever opened
  useEffect(() => {
    if (isOpen) {
      setCustomComponents(storageService.getCustomComponents());
    }
  }, [isOpen]);

  // Combine built-in with custom components
  const allComponents = useMemo(() => {
    return [...customComponents, ...BUILTIN_COMPONENTS];
  }, [customComponents]);

  // Filtered components
  const filteredComponents = useMemo(() => {
    return allComponents.filter((comp) => {
      // Tab filter
      if (activeTab === 'custom' && !comp.isCustom) return false;
      if (activeTab === 'builtin' && comp.isCustom) return false;
      if (activeTab !== 'all' && activeTab !== 'custom' && activeTab !== 'builtin') {
        if (comp.category !== activeTab) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = (comp.name || '').toLowerCase().includes(query);
        const matchDesc = (comp.description || '').toLowerCase().includes(query);
        const matchSnippet = (comp.snippet || '').toLowerCase().includes(query);
        const matchCategory = (comp.category || '').toLowerCase().includes(query);
        return matchName || matchDesc || matchSnippet || matchCategory;
      }

      return true;
    });
  }, [allComponents, activeTab, searchQuery]);

  if (!isOpen) return null;

  // Insert into editor
  const handleInsert = (comp: GzhComponentItem) => {
    onInsertSnippet(`\n${comp.snippet.trim()}\n\n`);
    setCopiedId(comp.id);
    if (onToast) onToast(`已插入「${comp.name}」到文章光标处`);
    setTimeout(() => setCopiedId(null), 1200);
  };

  // Copy raw snippet
  const handleCopyCode = async (comp: GzhComponentItem) => {
    try {
      await navigator.clipboard.writeText(comp.snippet.trim());
      setCopiedCodeId(comp.id);
      if (onToast) onToast(`已复制「${comp.name}」代码片段`);
      setTimeout(() => setCopiedCodeId(null), 1200);
    } catch (err) {
      console.error('Failed to copy snippet:', err);
    }
  };

  // Open Form to create new custom component
  const handleOpenCreateForm = (presetSnippet?: string, defaultCategory?: string) => {
    setEditingComponentId(null);
    setFormName('');
    setFormCategory(defaultCategory || 'highlight');
    setFormDescription('');
    setFormSnippet(presetSnippet || STARTER_TEMPLATES[0].snippet);
    setFormError(null);
    setShowFormPreview(false);
    setIsFormOpen(true);
  };

  // Open Form to edit existing custom component
  const handleOpenEditForm = (comp: GzhComponentItem) => {
    setEditingComponentId(comp.id);
    setFormName(comp.name);
    setFormCategory(comp.category);
    setFormDescription(comp.description);
    setFormSnippet(comp.snippet);
    setFormError(null);
    setShowFormPreview(false);
    setIsFormOpen(true);
  };

  // Clone any component into custom form
  const handleCloneComponent = (comp: GzhComponentItem) => {
    setEditingComponentId(null);
    setFormName(`${comp.name} (我的定制版)`);
    setFormCategory(comp.category);
    setFormDescription(comp.description || '基于内置组件自定义调整');
    setFormSnippet(comp.snippet);
    setFormError(null);
    setShowFormPreview(false);
    setIsFormOpen(true);
    if (onToast) onToast(`已载入「${comp.name}」模板，可修改后保存为自定义组件`);
  };

  // Save custom component
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('请输入组件名称');
      return;
    }
    if (!formSnippet.trim()) {
      setFormError('请输入排版组件代码片段');
      return;
    }

    if (editingComponentId) {
      // Update existing
      const updatedList = customComponents.map((item) => {
        if (item.id === editingComponentId) {
          return {
            ...item,
            name: formName.trim(),
            category: formCategory.trim() || 'custom',
            description: formDescription.trim() || '用户自定义排版组件',
            snippet: formSnippet.trim(),
            updatedAt: Date.now(),
          };
        }
        return item;
      });
      setCustomComponents(updatedList);
      storageService.saveCustomComponents(updatedList);
      if (onToast) onToast(`自定义组件「${formName.trim()}」更新成功！`);
    } else {
      // Create new
      const newComp: GzhComponentItem = {
        id: `custom-comp-${Date.now()}`,
        name: formName.trim(),
        category: formCategory.trim() || 'custom',
        description: formDescription.trim() || '用户自定义排版组件',
        snippet: formSnippet.trim(),
        isCustom: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updatedList = [newComp, ...customComponents];
      setCustomComponents(updatedList);
      storageService.saveCustomComponents(updatedList);
      setActiveTab('custom');
      if (onToast) onToast(`自定义组件「${newComp.name}」创建成功！`);
    }

    setIsFormOpen(false);
    setEditingComponentId(null);
  };

  // Delete custom component
  const handleDeleteCustom = (id: string, name: string) => {
    const updatedList = customComponents.filter((c) => c.id !== id);
    setCustomComponents(updatedList);
    storageService.saveCustomComponents(updatedList);
    setDeleteConfirmId(null);
    if (onToast) onToast(`已删除自定义组件「${name}」`);
  };

  return (
    <div
      id="gzh-component-drawer-overlay"
      className="fixed inset-0 z-40 bg-black/25 backdrop-blur-2xs flex justify-end transition-opacity select-none font-sans"
      onClick={onClose}
    >
      {/* Drawer Body */}
      <div
        id="gzh-component-drawer-container"
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">公众号排版组件库</h3>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                  支持自定义
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                可自由新建/定制专属排版模块 · 点击空白处即可关闭
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleOpenCreateForm()}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
              title="新建自定义排版组件"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建组件</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="关闭 (Esc 或点击空白处)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Custom Component Create / Edit Form Overlay Modal */}
        {isFormOpen && (
          <div className="p-4 bg-slate-50 border-b border-slate-200 animate-in fade-in duration-150">
            <form onSubmit={handleSaveForm} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <BookmarkPlus className="w-4 h-4 text-indigo-600" />
                  <span>{editingComponentId ? '编辑自定义组件' : '新建自定义排版组件'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {formError && (
                <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded">
                  {formError}
                </div>
              )}

              {/* Starter Template Pills (when creating new) */}
              {!editingComponentId && (
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">
                    快速预填模版（点击自动填入骨架）：
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STARTER_TEMPLATES.map((tmpl) => (
                      <button
                        key={tmpl.name}
                        type="button"
                        onClick={() => {
                          setFormSnippet(tmpl.snippet);
                          setFormCategory(tmpl.category);
                          if (!formName) setFormName(tmpl.name.replace(/\s*\(.*\)/, ''));
                        }}
                        className="text-[11px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:border-indigo-400 text-slate-600 transition-colors cursor-pointer"
                      >
                        {tmpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Name & Category Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">
                    组件名称 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="如：社群福利卡 / 重要警告"
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">分类标签</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="highlight">高亮卡片 (highlight)</option>
                    <option value="quote">金句引用 (quote)</option>
                    <option value="header">导语头图 (header)</option>
                    <option value="heading">章节标题 (heading)</option>
                    <option value="footer">文末签名 (footer)</option>
                    <option value="nav">目录导航 (nav)</option>
                    <option value="code">代码样式 (code)</option>
                    <option value="custom">通用自定义 (custom)</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  功能说明（可选）
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="一句话简要描述组件用途"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Snippet Code Area */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>排版代码片段 (Markdown 或 HTML)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowFormPreview(!showFormPreview)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                  >
                    {showFormPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showFormPreview ? '隐藏代码' : '预览文本'}</span>
                  </button>
                </div>

                {!showFormPreview ? (
                  <textarea
                    rows={6}
                    value={formSnippet}
                    onChange={(e) => setFormSnippet(e.target.value)}
                    placeholder="在此编写 Markdown 容器块 (如 :::callout ... :::) 或微信兼容 HTML"
                    className="w-full text-xs font-mono px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
                  />
                ) : (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                    {formSnippet || '<暂无代码内容>'}
                  </div>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-2xs"
                >
                  {editingComponentId ? '保存修改' : '确认添加自定义组件'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search & Tabs Filter Bar */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-2.5 bg-white shrink-0">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索排版组件（名称、说明、代码关键字）..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-white font-medium shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              全部 ({allComponents.length})
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                activeTab === 'custom'
                  ? 'bg-indigo-600 text-white font-medium shadow-2xs'
                  : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>我的自定义 ({customComponents.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('builtin')}
              className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'builtin'
                  ? 'bg-slate-800 text-white font-medium shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              内置预设 ({BUILTIN_COMPONENTS.length})
            </button>
            <button
              onClick={() => setActiveTab('highlight')}
              className={`px-2 py-1 rounded-full text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'highlight'
                  ? 'bg-amber-500 text-white font-medium'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              强调卡片
            </button>
            <button
              onClick={() => setActiveTab('quote')}
              className={`px-2 py-1 rounded-full text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'quote'
                  ? 'bg-emerald-600 text-white font-medium'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              金句引用
            </button>
            <button
              onClick={() => setActiveTab('footer')}
              className={`px-2 py-1 rounded-full text-[11px] whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'footer'
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              文末签名
            </button>
          </div>
        </div>

        {/* List of Components */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {filteredComponents.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Tag className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-700 mb-1">未找到匹配的排版组件</p>
              <p className="text-xs text-slate-400 mb-4">
                {activeTab === 'custom'
                  ? '您还没有创建自定义组件，点击下方按钮立即创建专属排版模块'
                  : '尝试更换搜索词或选择全部组件'}
              </p>
              <button
                onClick={() => handleOpenCreateForm()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建第一个自定义组件</span>
              </button>
            </div>
          ) : (
            filteredComponents.map((comp) => {
              const isInserted = copiedId === comp.id;
              const isCodeCopied = copiedCodeId === comp.id;
              const isCustom = Boolean(comp.isCustom);

              return (
                <div
                  key={comp.id}
                  className={`border rounded-xl p-3.5 bg-white transition-all flex flex-col justify-between hover:shadow-xs ${
                    isCustom
                      ? 'border-indigo-200/80 hover:border-indigo-400 bg-gradient-to-b from-indigo-50/20 to-white'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top Header of Card */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{comp.name}</span>
                        {isCustom && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 font-medium">
                            自定义
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono">
                          {comp.category}
                        </span>
                        {/* Custom actions: Edit & Delete */}
                        {isCustom ? (
                          <>
                            <button
                              onClick={() => handleOpenEditForm(comp)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                              title="编辑此自定义组件"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(comp.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              title="删除此组件"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          /* Clone built-in button */
                          <button
                            onClick={() => handleCloneComponent(comp)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                            title="克隆并个性化定制"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {comp.description && (
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                        {comp.description}
                      </p>
                    )}
                  </div>

                  {/* Delete Confirmation Banner */}
                  {deleteConfirmId === comp.id && (
                    <div className="my-2 p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-700 animate-in fade-in">
                      <span>确认彻底删除该组件？</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200 text-[11px]"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleDeleteCustom(comp.id, comp.name)}
                          className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-medium"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Snippet Code Preview Box */}
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 font-mono text-[11px] text-slate-600 line-clamp-3 overflow-hidden mb-3 whitespace-pre-wrap select-text">
                    {comp.snippet.trim()}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyCode(comp)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title="复制代码片段"
                    >
                      {isCodeCopied ? (
                        <>
                          <CopyCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 text-[11px]">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">复制代码</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleInsert(comp)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                        isInserted
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {isInserted ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>已插入至光标处</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>插入到正文</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <span>共 {allComponents.length} 个排版组件</span>
          <span className="flex items-center gap-1">
            <span>点击空白处随时返回编辑</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
};
