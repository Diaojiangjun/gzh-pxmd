import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Trash2,
  Copy,
  Download,
  Calendar,
  Clock,
  Check,
  Edit2,
  Sparkles,
  BookOpen,
  X,
  ExternalLink,
  FolderOpen,
  Save,
} from 'lucide-react';
import { ArticleItem } from '../types';
import { storageService } from '../services/storageService';

interface ArticleManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  articles: ArticleItem[];
  currentArticleId: string;
  onSelectArticle: (id: string) => void;
  onCreateNewArticle: (title?: string, templateType?: 'blank' | 'tech' | 'guide' | 'story') => void;
  /** 用「文件模板」（<文章文件夹>/_templates/*.md）新建文章 */
  onCreateFromTemplate: (name: string, content: string) => void;
  onDeleteArticle: (id: string) => void;
  onDuplicateArticle: (article: ArticleItem) => void;
  onRenameArticle: (id: string, newTitle: string) => void;
  onExportArticle: (article: ArticleItem) => void;
}

export const ArticleManagerDrawer: React.FC<ArticleManagerDrawerProps> = ({
  isOpen,
  onClose,
  articles,
  currentArticleId,
  onSelectArticle,
  onCreateNewArticle,
  onCreateFromTemplate,
  onDeleteArticle,
  onDuplicateArticle,
  onRenameArticle,
  onExportArticle,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 文件模板：来自 <文章文件夹>/_templates/*.md，仅在本地文件夹模式下有内容
  const [fileTemplates, setFileTemplates] = useState<
    Array<{ id: string; name: string; content: string }>
  >([]);
  const [templateDir, setTemplateDir] = useState<{ available: boolean; dir: string }>({
    available: false,
    dir: '',
  });

  const refreshTemplates = React.useCallback(() => {
    setFileTemplates(storageService.getFileTemplates());
    setTemplateDir(storageService.getTemplateDirInfo());
  }, []);

  // 每次打开抽屉都重新读取，这样在外部编辑器里新增/修改的模板能立刻反映出来
  React.useEffect(() => {
    if (!isOpen) return;
    refreshTemplates();
  }, [isOpen, refreshTemplates]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /** 把当前文章另存为文件模板 */
  const handleSaveCurrentAsTemplate = async () => {
    const current = articles.find((a) => a.id === currentArticleId);
    if (!current) return;
    const name = window.prompt('模板名称（将保存到模板文件夹）', current.title || '未命名模板');
    if (!name) return;
    const res = await storageService.saveFileTemplate(name, current.content);
    if (res.ok) {
      setShowNewMenu(false);
      refreshTemplates();
    } else {
      window.alert(res.error || '保存模板失败');
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!window.confirm(`确定删除模板「${name}」？该 .md 文件会从模板文件夹中移除。`)) return;
    const res = await storageService.deleteFileTemplate(id);
    if (res.ok) refreshTemplates();
    else window.alert(res.error || '删除模板失败');
  };

  const filteredArticles = articles.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartRename = (article: ArticleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(article.id);
    setEditingTitle(article.title);
  };

  const handleSaveRename = (id: string) => {
    if (editingTitle.trim()) {
      onRenameArticle(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return `今天 ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div
      className="fixed inset-0 md:left-14 z-40 flex justify-start bg-black/30 backdrop-blur-xs transition-opacity animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-r border-[#E5E7EB] font-sans animate-in slide-in-from-left duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#E5E7EB] flex items-center justify-between shrink-0 bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#F0FAF5] text-[#07C160] rounded-lg">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#2C3E50]">本地文章库</h2>
              <p className="text-[11px] text-[#94A3B8]">
                共 {articles.length} 篇文章 · 支持随时切换与离线自动保存
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#94A3B8] hover:text-[#2C3E50] hover:bg-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action & Search Bar */}
        <div className="p-3 border-b border-[#F1F5F9] space-y-2.5 bg-white shrink-0">
          <div className="flex items-center gap-2 relative">
            {/* Create Button with Menu */}
            <div className="relative flex-1">
              <button
                onClick={() => setShowNewMenu(!showNewMenu)}
                className="w-full py-2 px-3.5 bg-[#07C160] hover:bg-[#06ad56] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建本地文章</span>
              </button>

              {showNewMenu && (
                <div
                  className="absolute left-0 top-full mt-1.5 w-full bg-white rounded-xl shadow-xl border border-[#E5E7EB] py-1.5 z-50 text-xs text-[#2C3E50]"
                  onClick={() => setShowNewMenu(false)}
                >
                  <button
                    onClick={() => onCreateNewArticle('未命名文章', 'blank')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#64748B]" />
                    <div>
                      <div className="font-medium">新建空白文章</div>
                      <div className="text-[10px] text-[#94A3B8]">干净整洁的空白排版页</div>
                    </div>
                  </button>
                  <button
                    onClick={() => onCreateNewArticle('深度干货指南', 'guide')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#07C160]" />
                    <div>
                      <div className="font-medium text-[#07C160]">干货知识模板</div>
                      <div className="text-[10px] text-[#94A3B8]">包含导读卡、金句、分章节结构</div>
                    </div>
                  </button>
                  <button
                    onClick={() => onCreateNewArticle('前沿科技与动态', 'tech')}
                    className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                    <div>
                      <div className="font-medium text-[#2563EB]">科技前沿资讯模板</div>
                      <div className="text-[10px] text-[#94A3B8]">包含代码高亮、数据表格、引用说明</div>
                    </div>
                  </button>

                  {/* 文件模板：来自 <文章文件夹>/_templates/，仅在本地文件夹模式下出现 */}
                  {templateDir.available && (
                    <>
                      <div className="my-1 border-t border-[#F1F5F9]" />

                      <div className="px-3.5 py-1 flex items-center justify-between gap-2 text-[10px] text-[#94A3B8]">
                        <span>我的模板（{fileTemplates.length}）</span>
                        <span
                          role="button"
                          tabIndex={0}
                          title={templateDir.dir}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewMenu(false);
                            void storageService.openTemplatesDir();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              setShowNewMenu(false);
                              void storageService.openTemplatesDir();
                            }
                          }}
                          className="inline-flex items-center gap-1 hover:text-[#07C160] cursor-pointer shrink-0"
                        >
                          <FolderOpen className="w-3 h-3" />
                          打开模板文件夹
                        </span>
                      </div>

                      {fileTemplates.length === 0 ? (
                        <div className="px-3.5 pb-2 text-[10px] text-[#94A3B8] leading-relaxed">
                          模板文件夹还是空的。把 .md 放进{' '}
                          <code className="text-[#64748B]">_templates/</code>
                          就会出现在这里，也可以用下面的「存为模板」。
                        </div>
                      ) : (
                        fileTemplates.map((tpl) => (
                          <div
                            key={tpl.id}
                            className="group flex items-center gap-2 px-3.5 py-2 hover:bg-[#F8FAFC]"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                            <button
                              onClick={() => onCreateFromTemplate(tpl.name, tpl.content)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className="font-medium truncate">{tpl.name}</div>
                              <div className="text-[10px] text-[#94A3B8] truncate">
                                {tpl.content.slice(0, 40).replace(/\s+/g, ' ') || '（空模板）'}
                              </div>
                            </button>
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`删除模板 ${tpl.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteTemplate(tpl.id, tpl.name);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation();
                                  void handleDeleteTemplate(tpl.id, tpl.name);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-red-500 transition-opacity cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        ))
                      )}

                      <div className="my-1 border-t border-[#F1F5F9]" />
                      <button
                        onClick={() => {
                          void handleSaveCurrentAsTemplate();
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-[#F8FAFC] flex items-center gap-2"
                      >
                        <Save className="w-3.5 h-3.5 text-[#07C160]" />
                        <div>
                          <div className="font-medium text-[#07C160]">把当前文章存为模板</div>
                          <div className="text-[10px] text-[#94A3B8]">
                            写入模板文件夹，可用 Git 管理
                          </div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文章标题或正文关键字..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#F8FAFC] hover:bg-[#F1F5F9] focus:bg-white border border-[#E2E8F0] focus:border-[#07C160] rounded-lg outline-none transition-colors text-[#2C3E50]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#2C3E50]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Article List Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredArticles.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[#94A3B8]">
              <FileText className="w-10 h-10 stroke-1 mb-2.5 text-[#CBD5E1]" />
              <p className="text-xs font-medium text-[#64748B]">没有找到匹配的文章</p>
              <p className="text-[11px] mt-1">点击上方按钮快速新建一篇本地文章</p>
            </div>
          ) : (
            filteredArticles.map((article) => {
              const isCurrent = article.id === currentArticleId;
              const isEditing = editingId === article.id;
              const isDeleting = deleteConfirmId === article.id;

              return (
                <div
                  key={article.id}
                  onClick={() => {
                    if (!isCurrent) {
                      onSelectArticle(article.id);
                    }
                  }}
                  className={`group relative rounded-xl border p-3.5 transition-all cursor-pointer select-none ${
                    isCurrent
                      ? 'border-[#07C160] bg-[#F0FAF5]/40 shadow-xs'
                      : 'border-[#E5E7EB] hover:border-[#CBD5E1] bg-white hover:bg-[#F8FAFC]'
                  }`}
                >
                  {/* Card Header: Title & Badges */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    {isEditing ? (
                      <div
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(article.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="w-full text-xs font-semibold px-2 py-1 border border-[#07C160] rounded outline-none bg-white text-[#2C3E50]"
                        />
                        <button
                          onClick={() => handleSaveRename(article.id)}
                          className="p-1 bg-[#07C160] text-white rounded hover:bg-[#06ad56]"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-xs font-semibold truncate ${
                              isCurrent ? 'text-[#07C160]' : 'text-[#2C3E50]'
                            }`}
                            title={article.title}
                          >
                            {article.title}
                          </h3>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 bg-[#07C160] text-white text-[9px] font-bold rounded shrink-0">
                              当前编辑
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Quick Tools on Hover */}
                    <div
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => handleStartRename(article, e)}
                        className="p-1 text-[#94A3B8] hover:text-[#2C3E50] hover:bg-white rounded transition-colors"
                        title="重命名文章"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDuplicateArticle(article)}
                        className="p-1 text-[#94A3B8] hover:text-[#07C160] hover:bg-white rounded transition-colors"
                        title="创建文章副本"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onExportArticle(article)}
                        className="p-1 text-[#94A3B8] hover:text-[#2563EB] hover:bg-white rounded transition-colors"
                        title="导出 Markdown"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(article.id)}
                        className="p-1 text-[#94A3B8] hover:text-[#EF4444] hover:bg-white rounded transition-colors"
                        title="删除文章"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Content Preview Snippet */}
                  <p className="text-[11px] text-[#64748B] line-clamp-2 leading-relaxed mb-2 font-mono">
                    {article.content.replace(/[#*`>~-]/g, '').trim().slice(0, 100) ||
                      '（空白内容）'}
                  </p>

                  {/* Card Footer: Word Count and Time */}
                  <div className="flex items-center justify-between text-[10px] text-[#94A3B8] pt-1.5 border-t border-[#F1F5F9]">
                    <div className="flex items-center gap-2">
                      <span>{article.content.length} 字符</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(article.updatedAt)}
                      </span>
                    </div>

                    {!isCurrent && (
                      <span className="text-[#07C160] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        点击载入
                      </span>
                    )}
                  </div>

                  {/* Delete Confirmation Overlay */}
                  {isDeleting && (
                    <div
                      className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-between px-4 z-10 border border-[#EF4444]/30 animate-in fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs text-[#EF4444] font-medium">确认删除这篇文章？</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 text-[11px] text-[#64748B] hover:bg-gray-100 rounded"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => {
                            onDeleteArticle(article.id);
                            setDeleteConfirmId(null);
                          }}
                          className="px-2.5 py-1 text-[11px] bg-[#EF4444] text-white rounded font-medium hover:bg-red-600"
                        >
                          确认删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer Info */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E5E7EB] text-[11px] text-[#94A3B8] flex items-center justify-between shrink-0">
          <span>数据仅保存在本地浏览器/桌面客户端</span>
          <button
            onClick={() => onCreateNewArticle('未命名文章', 'blank')}
            className="text-[#07C160] font-medium hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>新建文章</span>
          </button>
        </div>
      </div>
    </div>
  );
};
