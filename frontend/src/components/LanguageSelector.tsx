import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { clsx } from 'clsx';

const LanguageSelector: React.FC = () => {
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'es', name: t('languages.spanish'), flag: '🇪🇸' },
    { code: 'en', name: t('languages.english'), flag: '🇺🇸' },
    { code: 'el', name: t('languages.greek'), flag: '🇬🇷' }
  ];

  const changeLanguage = (languageCode: string) => {
    i18n.changeLanguage(languageCode);
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <div className="relative group w-full">
      <div className="flex items-center justify-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors bg-gray-50 rounded-lg">
        <Languages className="w-4 h-4" />
        <span className="text-lg">{currentLanguage.flag}</span>
        <span className="font-medium">{currentLanguage.name}</span>
      </div>
      
      <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="py-2">
          {languages.map((language) => (
            <button
              key={language.code}
              onClick={() => changeLanguage(language.code)}
              className={clsx(
                'w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center space-x-3',
                {
                  'bg-blue-50 text-blue-700': i18n.language === language.code,
                  'text-gray-700': i18n.language !== language.code
                }
              )}
            >
              <span className="text-lg">{language.flag}</span>
              <span>{language.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LanguageSelector;