
import React, { useRef, useState } from 'react';
import { LevelConfiguration } from '../types';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customLevels: LevelConfiguration[];
  onExportLibrary: () => void;
  onImportLibrary: (file: File) => void;
  onDeleteLevel: (levelId: string | number) => void;
  onLoadLevel: (level: LevelConfiguration) => void;
  onPlayLevel: (level: LevelConfiguration) => void; // New prop to play level directly
}

const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  onClose,
  customLevels,
  onExportLibrary,
  onImportLibrary,
  onDeleteLevel,
  onLoadLevel,
  onPlayLevel, 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) {
    return null;
  }

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImportLibrary(file);
      event.target.value = ''; 
    }
  };

  const filteredLevels = customLevels.filter(level =>
    level.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLevelTypeLabel = (levelId: string | number): string => {
    const idStr = levelId.toString();
    if (idStr.startsWith('ai_')) return 'AI 생성';
    if (idStr.startsWith('custom_')) return '에디터';
    return '가져옴/기타';
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-gray-800 p-4 sm:p-6 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-yellow-400 orbitron-font">커스텀 레벨 라이브러리</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl"
            aria-label="라이브러리 닫기"
          >
            &times;
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
          <input
            type="text"
            placeholder="레벨 이름 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-md px-3 py-2 text-sm focus:ring-yellow-500 focus:border-yellow-500"
          />
          <button
            onClick={handleImportClick}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-sm text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-800"
            title="JSON 파일에서 레벨 라이브러리 가져오기"
          >
            라이브러리 가져오기
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            style={{ display: 'none' }}
          />
          <button
            onClick={onExportLibrary}
            disabled={customLevels.length === 0}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-600 disabled:cursor-not-allowed"
            title="현재 라이브러리를 JSON 파일로 내보내기"
          >
            라이브러리 내보내기
          </button>
        </div>

        <div className="flex-grow overflow-y-auto bg-gray-900/50 p-3 rounded-md border border-gray-700">
          {filteredLevels.length > 0 ? (
            <ul className="space-y-2">
              {filteredLevels.map((level) => (
                <li
                  key={level.levelId}
                  className="flex justify-between items-center p-3 bg-gray-700 rounded-md hover:bg-gray-600/70 transition-colors"
                >
                  <button 
                    onClick={() => onLoadLevel(level)} 
                    className="text-left flex-grow focus:outline-none mr-2"
                    title={`"${level.name}" 레벨 에디터에서 열기`}
                    aria-label={`"${level.name}" 레벨 에디터에서 열기`}
                  >
                    <span className="font-medium text-white text-sm sm:text-base hover:text-yellow-300 transition-colors">{level.name}</span>
                    <span className="ml-2 text-xs text-gray-400">({getLevelTypeLabel(level.levelId)})</span>
                  </button>
                  <div className="flex-shrink-0 flex items-center space-x-2">
                    <button
                        onClick={() => onPlayLevel(level)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2 focus:ring-offset-gray-700"
                        aria-label={`"${level.name}" 레벨 플레이`}
                        title={`"${level.name}" 레벨 플레이하기`}
                      >
                        플레이
                    </button>
                    <button
                        onClick={() => onDeleteLevel(level.levelId)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-gray-700"
                        aria-label={`"${level.name}" 레벨 삭제`}
                         title={`"${level.name}" 레벨 삭제하기`}
                      >
                        삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-center py-4">
              {customLevels.length === 0 ? "저장된 커스텀 레벨이 없습니다. 에디터에서 레벨을 만들어 저장하세요." : "검색 결과와 일치하는 레벨이 없습니다."}
            </p>
          )}
        </div>
         <p className="text-xs text-gray-500 mt-3 text-center">
            총 {customLevels.length}개의 커스텀 레벨이 라이브러리에 있습니다.
        </p>
      </div>
    </div>
  );
};

export default LibraryModal;
