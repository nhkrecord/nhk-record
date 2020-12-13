interface ScheduleItem {
  title: string;
  subtitle: string;
  content_clean: string;
  description: string;
  seriesId: string;
  airingId: string;
  pubDate: string;
  endDate: string;
  thumbnail: string;
}

interface Schedule {
  channel: {
    item: Array<ScheduleItem>;
  };
}
