import React, {useState, useEffect} from 'react';
import ArchivedView from '../components/views/ArchivedView.js';
import FullScreen from '../components/common/FullScreen.js';
import {useServices} from '../contexts/ServicesContext.js';

const h = React.createElement;

interface ArchivedScreenProps {
  onBack: () => void;
}

export default function ArchivedScreen({onBack}: ArchivedScreenProps) {
  const {gitService, worktreeService} = useServices();
  const [archivedItems, setArchivedItems] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadArchivedItems = () => {
    const projects = gitService.discoverProjects();
    const items: any[] = [];
    for (const project of projects) {
      items.push(...gitService.getArchivedForProject(project));
    }
    setArchivedItems(items);
    setSelectedIndex(prevIndex => Math.min(Math.max(0, items.length - 1), prevIndex));
  };

  useEffect(() => {
    loadArchivedItems();
  }, []);

  const handleMove = (delta: number) => {
    setSelectedIndex(currentIndex => 
      Math.max(0, Math.min(archivedItems.length - 1, currentIndex + delta))
    );
  };

  const handleDelete = (index: number) => {
    const item = archivedItems[index];
    if (!item) return;
    
    try {
      const success = worktreeService.deleteArchived(item.path);
      if (success) {
        loadArchivedItems();
      }
    } catch (error) {
      console.error('Failed to delete archived item:', error);
    }
  };

  return h(FullScreen, null,
    h(ArchivedView, {
      items: archivedItems as any,
      selectedIndex,
      onMove: handleMove,
      onDelete: handleDelete,
      onBack
    })
  );
}