import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Database, Sparkles, GitMerge } from 'lucide-react';

const ProcessesView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const processes = [
    {
      id: 'ingestion',
      title: t('processes.ingestion.title'),
      description: t('processes.ingestion.description'),
      icon: Database,
      color: 'blue',
      enabled: true,
      path: '/dashboard',
    },
    {
      id: 'cleaning',
      title: t('processes.cleaning.title'),
      description: t('processes.cleaning.description'),
      icon: Sparkles,
      color: 'green',
      enabled: true,
      path: '/cleaning',
    },
    {
      id: 'disambiguation',
      title: t('processes.disambiguation.title'),
      description: t('processes.disambiguation.description'),
      icon: GitMerge,
      color: 'purple',
      enabled: false,
      path: '/disambiguation',
    },
  ];

  const getColorClasses = (color: string, enabled: boolean) => {
    if (!enabled) {
      return {
        bg: 'bg-gray-100',
        icon: 'text-gray-400',
        border: 'border-gray-200',
        hover: '',
      };
    }

    const colors = {
      blue: {
        bg: 'bg-blue-50',
        icon: 'text-blue-600',
        border: 'border-blue-200',
        hover: 'hover:bg-blue-100 hover:border-blue-300',
      },
      green: {
        bg: 'bg-green-50',
        icon: 'text-green-600',
        border: 'border-green-200',
        hover: 'hover:bg-green-100 hover:border-green-300',
      },
      purple: {
        bg: 'bg-purple-50',
        icon: 'text-purple-600',
        border: 'border-purple-200',
        hover: 'hover:bg-purple-100 hover:border-purple-300',
      },
    };

    return colors[color as keyof typeof colors] || colors.blue;
  };

  const handleCardClick = (process: typeof processes[0]) => {
    if (process.enabled) {
      navigate(process.path);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            {t('processes.title')}
          </h1>
          <p className="text-lg text-gray-600">
            {t('processes.subtitle')}
          </p>
        </div>

        {/* Process Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {processes.map((process) => {
            const Icon = process.icon;
            const colors = getColorClasses(process.color, process.enabled);

            return (
              <div
                key={process.id}
                onClick={() => handleCardClick(process)}
                className={`
                  relative rounded-xl border-2 p-8 transition-all duration-200
                  ${colors.bg} ${colors.border}
                  ${process.enabled ? `${colors.hover} cursor-pointer shadow-md hover:shadow-xl` : 'cursor-not-allowed opacity-60'}
                `}
              >
                {/* Disabled Badge */}
                {!process.enabled && (
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                      {t('processes.comingSoon')}
                    </span>
                  </div>
                )}

                {/* Icon */}
                <div className="flex justify-center mb-6">
                  <div className={`p-4 rounded-full ${process.enabled ? colors.bg : 'bg-gray-200'}`}>
                    <Icon className={`w-12 h-12 ${colors.icon}`} />
                  </div>
                </div>

                {/* Content */}
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                    {process.title}
                  </h2>
                  <p className="text-gray-600 leading-relaxed">
                    {process.description}
                  </p>
                </div>

                {/* Action Indicator */}
                {process.enabled && (
                  <div className="mt-6 text-center">
                    <span className={`text-sm font-medium ${colors.icon}`}>
                      {t('processes.clickToAccess')} →
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            {t('processes.info')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProcessesView;
