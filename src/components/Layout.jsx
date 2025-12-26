import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Home, BarChart3, DollarSign, FileText, Settings as SettingsIcon } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
  const navItems = [
    { name: 'Dashboard', page: 'Dashboard', icon: Home },
    { name: 'Actions', page: 'Actions', icon: BarChart3 },
    { name: 'Finances', page: 'Finances', icon: DollarSign },
    { name: 'Reports', page: 'Reports', icon: FileText },
    { name: 'Settings', page: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50">
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">🐑</span>
              </div>
              <span className="text-xl font-bold text-gray-900">Sheep Management</span>
            </div>
            <div className="flex gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.page;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive
                        ? 'bg-green-100 text-green-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
