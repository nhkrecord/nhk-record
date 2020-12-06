type ScheduleItem = {
  title: string;
  subtitle: string;
  content_clean: string;
  description: string;
  seriesId: string;
  airingId: string;
  pubDate: string;
  endDate: string;
  thumbnail: string;
};

type Schedule = {
  channel: {
    item: Array<ScheduleItem>;
  };
};
