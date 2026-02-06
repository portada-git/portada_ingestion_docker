/**
 * Data Visualization Component
 * Provides charts and graphs for data analysis
 */

import React from 'react';
import { BarChart3, TrendingUp, PieChart } from 'lucide-react';

interface ChartData {
  label: string;
  value: number;
  color?: string;
}

interface DataVisualizationProps {
  data: ChartData[];
  type: 'bar' | 'line' | 'pie';
  title?: string;
  height?: number;
  showLegend?: boolean;
}

const DataVisualization: React.FC<DataVisualizationProps> = ({
  data,
  type,
  title,
  height = 300,
  showLegend = true
}) => {
  const maxValue = Math.max(...data.map(d => d.value));
  
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
  ];

  const getColor = (index: number, customColor?: string) => {
    return customColor || colors[index % colors.length];
  };

  const renderBarChart = () => (
    <div className="space-y-3">
      {data.map((item, index) => (
        <div key={index} className="flex items-center space-x-3">
          <div className="w-20 text-sm text-gray-600 truncate" title={item.label}>
            {item.label}
          </div>
          <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
            <div
              className="h-6 rounded-full flex items-center justify-end pr-2 text-white text-xs font-medium transition-all duration-500"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: getColor(index, item.color),
                minWidth: item.value > 0 ? '20px' : '0px'
              }}
            >
              {item.value > 0 && (
                <span className="text-white text-xs">
                  {item.value.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderLineChart = () => {
    const points = data.map((item, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - (item.value / maxValue) * 80; // 80% of height for padding
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="relative">
        <svg width="100%" height={height} className="border border-gray-200 rounded-lg bg-white">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(y => (
            <line
              key={y}
              x1="0"
              y1={`${y}%`}
              x2="100%"
              y2={`${y}%`}
              stroke="#E5E7EB"
              strokeWidth="1"
            />
          ))}
          
          {/* Data line */}
          <polyline
            points={points}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {data.map((item, index) => {
            const x = (index / (data.length - 1)) * 100;
            const y = 100 - (item.value / maxValue) * 80;
            return (
              <circle
                key={index}
                cx={`${x}%`}
                cy={`${y}%`}
                r="4"
                fill="#3B82F6"
                className="hover:r-6 transition-all cursor-pointer"
              >
                <title>{`${item.label}: ${item.value}`}</title>
              </circle>
            );
          })}
        </svg>
        
        {/* X-axis labels */}
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          {data.map((item, index) => (
            <span key={index} className="truncate max-w-16" title={item.label}>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderPieChart = () => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = 0;
    
    const slices = data.map((item, index) => {
      const percentage = (item.value / total) * 100;
      const angle = (item.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;
      
      const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
      const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
      const x2 = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
      const y2 = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);
      
      const largeArcFlag = angle > 180 ? 1 : 0;
      
      const pathData = [
        `M 50 50`,
        `L ${x1} ${y1}`,
        `A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z'
      ].join(' ');
      
      return {
        ...item,
        pathData,
        percentage,
        color: getColor(index, item.color)
      };
    });

    return (
      <div className="flex items-center space-x-6">
        <div className="flex-shrink-0">
          <svg width="200" height="200" viewBox="0 0 100 100" className="transform -rotate-90">
            {slices.map((slice, index) => (
              <path
                key={index}
                d={slice.pathData}
                fill={slice.color}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              >
                <title>{`${slice.label}: ${slice.value} (${slice.percentage.toFixed(1)}%)`}</title>
              </path>
            ))}
          </svg>
        </div>
        
        {showLegend && (
          <div className="space-y-2">
            {slices.map((slice, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-sm text-gray-700">
                  {slice.label} ({slice.percentage.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const getIcon = () => {
    switch (type) {
      case 'bar':
        return <BarChart3 className="w-5 h-5" />;
      case 'line':
        return <TrendingUp className="w-5 h-5" />;
      case 'pie':
        return <PieChart className="w-5 h-5" />;
      default:
        return <BarChart3 className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {title && (
        <div className="flex items-center mb-4">
          {getIcon()}
          <h3 className="ml-2 text-lg font-semibold text-gray-900">{title}</h3>
        </div>
      )}
      
      <div style={{ height: type === 'pie' ? 'auto' : height }}>
        {type === 'bar' && renderBarChart()}
        {type === 'line' && renderLineChart()}
        {type === 'pie' && renderPieChart()}
      </div>
      
      {data.length === 0 && (
        <div className="flex items-center justify-center h-32 text-gray-500">
          <div className="text-center">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No hay datos para mostrar</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataVisualization;